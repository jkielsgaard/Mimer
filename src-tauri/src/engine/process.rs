//! Starts, watches and stops the engine process.
//!
//! The engine must never outlive Mimer, because it holds gigabytes of memory. It is stopped by
//! Sleep, by Mimer closing, and also when Mimer is killed or crashes: on Linux the engine asks the
//! kernel to kill it when its parent dies, on Windows it is put in a job object that kills it when
//! Mimer's last handle closes. As a last resort a pid file lets the next start remove a leftover.

use crate::settings::{BuiltInSettings, FlashAttention, GpuUse};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Lines of engine output kept in memory for the problem screen.
pub const LOG_LINES: usize = 400;

/// How the engine ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExitInfo {
    /// The exit code. On Windows the error code (for example `0xC0000135`) as a signed number.
    pub code: Option<i32>,
    /// The signal that ended it (Linux).
    pub signal: Option<i32>,
}

/// What to start.
#[derive(Debug, Clone)]
pub struct Launch {
    pub server: PathBuf,
    /// The folder of the engine; the working folder and the place its libraries are loaded from.
    pub dir: PathBuf,
    pub args: Vec<String>,
    /// The key the engine requires on every request. Passed in the environment, not on the command
    /// line, so other users of the computer cannot read it from the process list.
    pub token: String,
    /// Everything the engine prints is also written here.
    pub log_file: PathBuf,
}

enum Ctl {
    Kill,
}

#[derive(Default)]
struct Shared {
    log: Mutex<VecDeque<String>>,
    exit: Mutex<Option<ExitInfo>>,
}

/// A running engine process.
pub struct Running {
    pub pid: u32,
    ctl: Sender<Ctl>,
    shared: Arc<Shared>,
}

impl Running {
    /// How the process ended, or `None` while it is still running.
    pub fn exit(&self) -> Option<ExitInfo> {
        self.shared.exit.lock().ok().and_then(|e| *e)
    }

    /// The last lines the engine printed (oldest first).
    pub fn log(&self) -> Vec<String> {
        self.shared
            .log
            .lock()
            .map(|l| l.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Stops the process and waits (up to `wait`) until it is gone.
    pub fn stop(&self, wait: Duration) {
        let _ = self.ctl.send(Ctl::Kill);
        let start = Instant::now();
        while self.exit().is_none() && start.elapsed() < wait {
            std::thread::sleep(Duration::from_millis(25));
        }
    }
}

fn push_line(shared: &Shared, file: &Mutex<Option<std::fs::File>>, line: String) {
    if let Ok(mut f) = file.lock() {
        if let Some(f) = f.as_mut() {
            let _ = writeln!(f, "{line}");
        }
    }
    if let Ok(mut log) = shared.log.lock() {
        if log.len() >= LOG_LINES {
            log.pop_front();
        }
        log.push_back(line);
    }
}

fn read_lines<R: std::io::Read + Send + 'static>(
    reader: R,
    shared: Arc<Shared>,
    file: Arc<Mutex<Option<std::fs::File>>>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            match line {
                Ok(l) => push_line(&shared, &file, l),
                // Not valid text: keep reading.
                Err(e) if e.kind() == std::io::ErrorKind::InvalidData => continue,
                Err(_) => break,
            }
        }
    })
}

#[cfg(unix)]
fn exit_info(status: std::process::ExitStatus) -> ExitInfo {
    use std::os::unix::process::ExitStatusExt;
    ExitInfo {
        code: status.code(),
        signal: status.signal(),
    }
}

#[cfg(not(unix))]
fn exit_info(status: std::process::ExitStatus) -> ExitInfo {
    ExitInfo {
        code: status.code(),
        signal: None,
    }
}

fn command(l: &Launch) -> Command {
    let mut cmd = Command::new(&l.server);
    cmd.args(&l.args)
        .current_dir(&l.dir)
        .env("LLAMA_API_KEY", &l.token)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        // The engine finds its libraries next to itself.
        let existing = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
        let path = if existing.is_empty() {
            l.dir.display().to_string()
        } else {
            format!("{}:{existing}", l.dir.display())
        };
        cmd.env("LD_LIBRARY_PATH", path);
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: the closure runs in the child between fork and exec and only calls `prctl`,
        // which is async-signal-safe. It asks the kernel to kill the engine when its parent dies.
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
                Ok(())
            });
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: no console window.
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

/// Starts the engine. The process is started and watched from a thread of its own that lives as
/// long as the process does: the Linux "parent died" signal is tied to the thread that started
/// the process, so it must not be a thread that can end early.
pub fn spawn(l: &Launch) -> Result<Running, std::io::Error> {
    if let Some(dir) = l.log_file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let file = Arc::new(Mutex::new(std::fs::File::create(&l.log_file).ok()));
    let shared = Arc::new(Shared::default());
    let (ctl_tx, ctl_rx): (Sender<Ctl>, Receiver<Ctl>) = mpsc::channel();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<u32, std::io::Error>>();
    let launch = l.clone();
    let shared_t = shared.clone();
    std::thread::Builder::new()
        .name("mimer-engine".into())
        .spawn(move || {
            let mut child = match command(&launch).spawn() {
                Ok(c) => c,
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                    return;
                }
            };
            #[cfg(windows)]
            super::winjob::keep_with_mimer(&child);
            let readers: Vec<_> = [
                child
                    .stdout
                    .take()
                    .map(|s| read_lines(s, shared_t.clone(), file.clone())),
                child
                    .stderr
                    .take()
                    .map(|s| read_lines(s, shared_t.clone(), file.clone())),
            ]
            .into_iter()
            .flatten()
            .collect();
            let _ = ready_tx.send(Ok(child.id()));
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Let the readers finish so the last lines are in the log.
                        for r in readers {
                            let _ = r.join();
                        }
                        if let Ok(mut e) = shared_t.exit.lock() {
                            *e = Some(exit_info(status));
                        }
                        return;
                    }
                    Ok(None) => {}
                    Err(_) => {
                        if let Ok(mut e) = shared_t.exit.lock() {
                            *e = Some(ExitInfo {
                                code: None,
                                signal: None,
                            });
                        }
                        return;
                    }
                }
                match ctl_rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(Ctl::Kill) => {
                        let _ = child.kill();
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    // Nobody can stop it any more: kill it rather than leave it running.
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        let _ = child.kill();
                    }
                }
            }
        })?;
    let pid = ready_rx
        .recv()
        .map_err(|_| std::io::Error::other("The engine thread ended before starting"))??;
    Ok(Running {
        pid,
        ctl: ctl_tx,
        shared,
    })
}

/// The command-line arguments for the engine. The server only listens on this computer.
pub fn build_args(s: &BuiltInSettings, model: &Path, port: u16) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--model".into(),
        model.display().to_string(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "--alias".into(),
        super::BUILTIN_ALIAS.into(),
        "--ctx-size".into(),
        s.context_tokens.to_string(),
        // One conversation at a time: the memory is not split between several.
        "--parallel".into(),
        "1".into(),
        "--jinja".into(),
        "--no-webui".into(),
        "--no-slots".into(),
    ];
    match s.gpu_use {
        GpuUse::Auto => {}
        GpuUse::All => a.extend(["--n-gpu-layers".into(), "all".into()]),
        GpuUse::None => a.extend(["--n-gpu-layers".into(), "0".into()]),
        GpuUse::Custom => a.extend(["--n-gpu-layers".into(), s.gpu_layer_count.to_string()]),
    }
    if s.threads > 0 {
        a.extend(["--threads".into(), s.threads.to_string()]);
    }
    let fa = match s.flash_attention {
        FlashAttention::Auto => "auto",
        FlashAttention::On => "on",
        FlashAttention::Off => "off",
    };
    a.extend(["--flash-attn".into(), fa.into()]);
    // Gemma's chat template asks the model to think unless this is off. With it off the answer
    // is the answer; with it on the engine keeps the thinking apart from the answer.
    a.extend([
        "--reasoning".into(),
        if s.thinking { "on" } else { "off" }.into(),
    ]);
    a
}

/// A port nobody is listening on right now (asked from the system; there is a tiny chance that
/// something else takes it before the engine does, which shows up as a "port in use" problem).
pub fn free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

/// A random key for one run of the engine.
pub fn random_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Removes an engine left over from an earlier run of Mimer (for example after a crash on a
/// system where the engine could not be tied to Mimer). Only a process that really is
/// `llama-server` is touched.
pub fn kill_leftover(pid: u32) -> bool {
    #[cfg(target_os = "linux")]
    {
        let comm = std::fs::read_to_string(format!("/proc/{pid}/comm")).unwrap_or_default();
        if comm.trim() != "llama-server" {
            return false;
        }
        // SAFETY: plain `kill` of a process id we just verified to be an engine.
        return unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) } == 0;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let out = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .creation_flags(0x0800_0000)
            .output();
        let listed = out
            .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase())
            .unwrap_or_default();
        if !listed.contains("llama-server.exe") {
            return false;
        }
        return Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .creation_flags(0x0800_0000)
            .status()
            .is_ok_and(|s| s.success());
    }
    #[allow(unreachable_code)]
    {
        let _ = pid;
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::BuiltInSettings;

    fn settings() -> BuiltInSettings {
        BuiltInSettings::default()
    }

    fn pos(args: &[String], flag: &str) -> Option<usize> {
        args.iter().position(|a| a == flag)
    }

    fn value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        pos(args, flag)
            .and_then(|i| args.get(i + 1))
            .map(String::as_str)
    }

    #[test]
    fn the_server_only_listens_on_this_computer_and_has_no_web_page() {
        let a = build_args(&settings(), Path::new("/m/model.gguf"), 4242);
        assert_eq!(value(&a, "--host"), Some("127.0.0.1"));
        assert_eq!(value(&a, "--port"), Some("4242"));
        assert_eq!(value(&a, "--model"), Some("/m/model.gguf"));
        assert!(a.contains(&"--no-webui".to_string()));
        assert_eq!(value(&a, "--parallel"), Some("1"));
        // The key is never on the command line.
        assert!(!a.iter().any(|x| x.contains("api-key")));
    }

    #[test]
    fn settings_become_arguments() {
        let mut s = settings();
        s.context_tokens = 8192;
        s.threads = 6;
        s.gpu_use = GpuUse::Custom;
        s.gpu_layer_count = 20;
        s.flash_attention = FlashAttention::Off;
        s.thinking = true;
        let a = build_args(&s, Path::new("m"), 1);
        assert_eq!(value(&a, "--ctx-size"), Some("8192"));
        assert_eq!(value(&a, "--threads"), Some("6"));
        assert_eq!(value(&a, "--n-gpu-layers"), Some("20"));
        assert_eq!(value(&a, "--flash-attn"), Some("off"));
        assert_eq!(value(&a, "--reasoning"), Some("on"), "thinking is allowed");

        s.gpu_use = GpuUse::None;
        s.threads = 0;
        s.thinking = false;
        let a = build_args(&s, Path::new("m"), 1);
        assert_eq!(value(&a, "--n-gpu-layers"), Some("0"));
        assert!(
            pos(&a, "--threads").is_none(),
            "0 threads = let the engine decide"
        );
        assert_eq!(value(&a, "--reasoning"), Some("off"));

        s.gpu_use = GpuUse::All;
        assert_eq!(
            value(&build_args(&s, Path::new("m"), 1), "--n-gpu-layers"),
            Some("all")
        );
        s.gpu_use = GpuUse::Auto;
        assert!(pos(&build_args(&s, Path::new("m"), 1), "--n-gpu-layers").is_none());
    }

    #[test]
    fn ports_are_free_and_tokens_are_random_and_long() {
        let p = free_port().unwrap();
        assert!(p > 1023);
        let (a, b) = (random_token(), random_token());
        assert_ne!(a, b);
        assert!(a.len() >= 64);
    }

    #[cfg(unix)]
    fn launch(dir: &Path, script: &str) -> Launch {
        Launch {
            server: PathBuf::from("/bin/sh"),
            dir: dir.to_path_buf(),
            args: vec!["-c".into(), script.into()],
            token: "secret-token".into(),
            log_file: dir.join("engine.log"),
        }
    }

    #[cfg(unix)]
    fn wait_exit(r: &Running) -> ExitInfo {
        for _ in 0..200 {
            if let Some(e) = r.exit() {
                return e;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("the process did not end");
    }

    #[cfg(unix)]
    #[test]
    fn output_and_the_exit_code_are_captured_and_logged() {
        let d = tempfile::tempdir().unwrap();
        let r = spawn(&launch(d.path(), "echo hello; echo oops >&2; exit 3")).unwrap();
        let e = wait_exit(&r);
        assert_eq!(e.code, Some(3));
        let log = r.log();
        assert!(log.contains(&"hello".to_string()), "{log:?}");
        assert!(log.contains(&"oops".to_string()), "{log:?}");
        let file = std::fs::read_to_string(d.path().join("engine.log")).unwrap();
        assert!(file.contains("hello"));
    }

    #[cfg(unix)]
    #[test]
    fn the_key_is_passed_in_the_environment() {
        let d = tempfile::tempdir().unwrap();
        let r = spawn(&launch(d.path(), "echo key=$LLAMA_API_KEY")).unwrap();
        wait_exit(&r);
        assert!(r.log().contains(&"key=secret-token".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn stop_ends_a_running_process_quickly() {
        let d = tempfile::tempdir().unwrap();
        let r = spawn(&launch(d.path(), "exec sleep 60")).unwrap();
        assert!(r.exit().is_none(), "still running");
        let start = Instant::now();
        r.stop(Duration::from_secs(5));
        assert!(r.exit().is_some(), "stopped");
        assert!(start.elapsed() < Duration::from_secs(3));
        #[cfg(target_os = "linux")]
        assert!(
            !Path::new(&format!("/proc/{}", r.pid)).exists(),
            "the process is gone"
        );
    }

    #[test]
    fn a_program_that_does_not_exist_gives_an_error_to_explain() {
        let d = tempfile::tempdir().unwrap();
        let l = Launch {
            server: d.path().join("no-such-program"),
            dir: d.path().to_path_buf(),
            args: vec![],
            token: "t".into(),
            log_file: d.path().join("log"),
        };
        let err = spawn(&l).err().expect("must fail");
        assert_eq!(err.kind(), std::io::ErrorKind::NotFound);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn only_a_real_engine_is_removed_as_a_leftover() {
        // This test process is not called llama-server.
        assert!(!kill_leftover(std::process::id()));
        assert!(!kill_leftover(4_000_000));
    }

    /// Runs the real engine with a real model (not run by default). Set
    /// `MIMER_TEST_ENGINE_DIR` (the unpacked engine) and `MIMER_TEST_MODEL` (a .gguf file), then:
    /// `cargo test engine::process::tests::real_engine -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "needs a downloaded engine and model"]
    async fn real_engine_wakes_answers_needs_the_key_and_sleeps() {
        let dir =
            PathBuf::from(std::env::var("MIMER_TEST_ENGINE_DIR").expect("MIMER_TEST_ENGINE_DIR"));
        let model = PathBuf::from(std::env::var("MIMER_TEST_MODEL").expect("MIMER_TEST_MODEL"));
        let port = free_port().unwrap();
        let token = random_token();
        let mut s = settings();
        s.context_tokens = 4096;
        let tmp = tempfile::tempdir().unwrap();
        let launch = Launch {
            server: dir.join(if cfg!(windows) {
                "llama-server.exe"
            } else {
                "llama-server"
            }),
            dir: dir.clone(),
            args: build_args(&s, &model, port),
            token: token.clone(),
            log_file: tmp.path().join("engine.log"),
        };
        let started = Instant::now();
        let running = spawn(&launch).unwrap();
        let client = reqwest::Client::new();
        let health = format!("http://127.0.0.1:{port}/health");
        loop {
            assert!(
                running.exit().is_none(),
                "the engine stopped: {:?}",
                running.log()
            );
            assert!(started.elapsed() < Duration::from_secs(300), "too slow");
            if client
                .get(&health)
                .send()
                .await
                .is_ok_and(|r| r.status().is_success())
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        println!("ready after {:?}", started.elapsed());
        let url = format!("http://127.0.0.1:{port}/v1/chat/completions");
        let body = serde_json::json!({
            "model": crate::engine::BUILTIN_ALIAS,
            "messages": [{"role": "user", "content": "Reply with the single word: pong"}],
            "max_tokens": 64,
            "stream": false
        });
        // Without the key the engine refuses.
        let denied = client.post(&url).json(&body).send().await.unwrap();
        assert_eq!(
            denied.status().as_u16(),
            401,
            "a request without the key must be refused"
        );
        // With the key it answers.
        let ok = client
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert!(ok.status().is_success(), "{}", ok.status());
        let v: serde_json::Value = ok.json().await.unwrap();
        let text = v["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        println!("answer: {text:?}");
        assert!(!text.trim().is_empty(), "{v}");
        // Sleep: the process ends and the port is free again.
        running.stop(Duration::from_secs(10));
        assert!(running.exit().is_some());
        assert!(
            client.get(&health).send().await.is_err(),
            "the server is gone"
        );
    }
}
