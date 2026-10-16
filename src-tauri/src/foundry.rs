//! Finding Foundry Local, Microsoft's program for running AI models on Windows (and macOS) with
//! the best hardware of the computer, including a neural processor (NPU).
//!
//! Foundry Local is installed by the user (`winget install Microsoft.FoundryLocal`), not by Mimer.
//! It runs a local web service with an OpenAI-compatible interface on a port it chooses itself, so
//! the address is read from `foundry service status`. Mimer only talks to that address, like it
//! does to LM Studio.

use serde::Serialize;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use ts_rs::TS;

/// How long a `foundry` command may take before it is given up.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(20);

/// What was found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FoundryStatus {
    /// The `foundry` program was found.
    pub installed: bool,
    /// Its service is running and the address was found.
    pub running: bool,
    /// The address to use as the provider's base URL (`http://127.0.0.1:<port>/v1`).
    pub base_url: Option<String>,
    /// One or two sentences for the user: what was found, or what to do.
    pub message: String,
}

/// Reads the service address out of the text `foundry service status` prints (for example
/// `Model management service is running on http://127.0.0.1:5272/openai/status`) and returns the
/// base URL of the OpenAI-compatible interface. Only an address on this computer is accepted.
pub fn parse_base_url(output: &str) -> Option<String> {
    for word in output.split_whitespace() {
        let word = word.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != ':' && c != '/');
        let Some(rest) = word.strip_prefix("http://") else {
            continue;
        };
        let host_port = rest.split('/').next().unwrap_or("");
        let Some((host, port)) = host_port.rsplit_once(':') else {
            continue;
        };
        let host = host.trim_start_matches('[').trim_end_matches(']');
        if !(host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1") {
            continue;
        }
        if let Ok(port) = port.parse::<u16>() {
            if port > 0 {
                return Some(format!("http://127.0.0.1:{port}/v1"));
            }
        }
    }
    None
}

/// Runs `foundry <args>` and returns what it printed, or `None` when it is not installed.
fn run(args: &[&str]) -> Result<Option<String>, String> {
    let mut cmd = Command::new("foundry");
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: no console window flashes up.
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("`foundry` could not be started: {e}")),
    };
    let deadline = Instant::now() + COMMAND_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("`foundry` did not answer in time".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(format!("`foundry` could not be checked: {e}")),
        }
    }
    let mut text = String::new();
    if let Some(mut out) = child.stdout.take() {
        let mut bytes = Vec::new();
        let _ = out.read_to_end(&mut bytes);
        text.push_str(&String::from_utf8_lossy(&bytes));
    }
    if let Some(mut err) = child.stderr.take() {
        let mut bytes = Vec::new();
        let _ = err.read_to_end(&mut bytes);
        text.push('\n');
        text.push_str(&String::from_utf8_lossy(&bytes));
    }
    Ok(Some(text))
}

fn status_from(output: &str) -> FoundryStatus {
    match parse_base_url(output) {
        Some(url) => FoundryStatus {
            installed: true,
            running: true,
            message: format!("Foundry Local is running. Address: {url}"),
            base_url: Some(url),
        },
        None => FoundryStatus {
            installed: true,
            running: false,
            base_url: None,
            message: "Foundry Local is installed, but its service is not running. Run `foundry model run <model>` in a terminal (for example `foundry model run phi-4-mini`), then press Detect again.".into(),
        },
    }
}

/// Looks for Foundry Local. When it is installed but its service is not running, the service is
/// started (the user asked for the detection) and the address is read again.
pub fn detect() -> FoundryStatus {
    let first = match run(&["service", "status"]) {
        Ok(Some(text)) => text,
        Ok(None) => return not_installed(),
        Err(message) => {
            return FoundryStatus {
                installed: true,
                running: false,
                base_url: None,
                message,
            }
        }
    };
    let status = status_from(&first);
    if status.running {
        return status;
    }
    // Try to start the service once.
    if run(&["service", "start"]).is_ok() {
        if let Ok(Some(text)) = run(&["service", "status"]) {
            return status_from(&text);
        }
    }
    status
}

fn not_installed() -> FoundryStatus {
    FoundryStatus {
        installed: false,
        running: false,
        base_url: None,
        message: if cfg!(windows) {
            "Foundry Local was not found. Install it from a terminal with `winget install Microsoft.FoundryLocal`, then press Detect again. Not every computer allows winget; ask your IT department if it is blocked.".into()
        } else {
            "Foundry Local was not found. Microsoft offers it for Windows and macOS; it is not available for Linux. Use LM Studio or the built-in AI here.".into()
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_address_is_read_from_the_status_text() {
        let text =
            "🟢 Model management service is running on http://127.0.0.1:5272/openai/status\n";
        assert_eq!(
            parse_base_url(text).as_deref(),
            Some("http://127.0.0.1:5272/v1")
        );
        assert_eq!(
            parse_base_url("service running on http://localhost:52593/openai/status.").as_deref(),
            Some("http://127.0.0.1:52593/v1")
        );
        assert_eq!(
            parse_base_url("on http://[::1]:61000/openai/status").as_deref(),
            Some("http://127.0.0.1:61000/v1")
        );
    }

    #[test]
    fn only_addresses_on_this_computer_are_accepted() {
        assert_eq!(
            parse_base_url("running on http://10.0.0.5:5272/openai/status"),
            None
        );
        assert_eq!(parse_base_url("running on http://example.com:80/x"), None);
        assert_eq!(parse_base_url("running on https://127.0.0.1:5272/x"), None);
        assert_eq!(parse_base_url("http://127.0.0.1:0/x"), None);
        assert_eq!(parse_base_url("http://127.0.0.1:99999/x"), None);
        assert_eq!(parse_base_url("The service is not running."), None);
        assert_eq!(parse_base_url(""), None);
    }

    #[test]
    fn a_status_without_an_address_says_what_to_do() {
        let s = status_from("Model management service is not running!");
        assert!(s.installed && !s.running && s.base_url.is_none());
        assert!(s.message.contains("foundry model run"));
        let ok = status_from("running on http://127.0.0.1:5272/openai/status");
        assert!(ok.running);
        assert_eq!(ok.base_url.as_deref(), Some("http://127.0.0.1:5272/v1"));
    }

    #[test]
    fn a_missing_program_gives_install_help() {
        let n = not_installed();
        assert!(!n.installed && n.base_url.is_none());
        assert!(n.message.contains("not found"));
    }
}
