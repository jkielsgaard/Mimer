//! Opening a web address in the user's own browser.
//!
//! On Linux the AppImage starts Mimer with environment variables that point into the image
//! (`GIO_MODULE_DIR`, `GTK_PATH`, `XDG_DATA_DIRS`, ...). A program started from Mimer inherits them,
//! and a browser or `xdg-open` that finds the wrong libraries can fail without saying anything. So
//! the address is opened by `xdg-open` with those variables removed, and a failure is reported.

use crate::error::{AppError, AppResult};

/// The kinds of address Mimer opens outside the app.
const SCHEMES: &[&str] = &["http://", "https://", "mailto:", "tel:"];

/// True for an address Mimer may open: a known scheme and no spaces or control characters.
pub fn is_allowed_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    SCHEMES.iter().any(|s| lower.starts_with(s))
        && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

/// What to do with the environment of a program started from inside an AppImage: variables to
/// remove, and variables to set to a cleaned value.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct EnvChanges {
    pub remove: Vec<String>,
    pub set: Vec<(String, String)>,
}

/// Works out how to clean `vars` of everything that points into `appdir`. A list of folders
/// (`a:b:c`) keeps its other entries; any other variable that mentions `appdir` is removed.
pub fn clean_env(vars: &[(String, String)], appdir: &str) -> EnvChanges {
    let mut out = EnvChanges::default();
    if appdir.is_empty() {
        return out;
    }
    for (name, value) in vars {
        if name == "APPDIR" {
            out.remove.push(name.clone());
        } else if value.contains(appdir) {
            let kept: Vec<&str> = value
                .split(':')
                .filter(|part| !part.contains(appdir) && !part.is_empty())
                .collect();
            if kept.is_empty() || !value.contains(':') {
                out.remove.push(name.clone());
            } else {
                out.set.push((name.clone(), kept.join(":")));
            }
        }
    }
    out
}

/// Fails unless `url` is an address Mimer may open.
pub fn check_url(url: &str) -> AppResult<()> {
    if is_allowed_url(url) {
        Ok(())
    } else {
        Err(AppError::InvalidPath(
            "Only web, mail and phone addresses can be opened".into(),
        ))
    }
}

/// Opens `url` with `xdg-open` (or `gio open`), cleaned of the AppImage's variables. Returns an
/// error that says what to do when no program could open it.
#[cfg(target_os = "linux")]
pub fn open_linux(url: &str) -> AppResult<()> {
    check_url(url)?;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let vars: Vec<(String, String)> = std::env::vars().collect();
    let changes = clean_env(&vars, &std::env::var("APPDIR").unwrap_or_default());
    let mut last_error = String::from("no program to open links was found");
    for program in [vec!["xdg-open"], vec!["gio", "open"]] {
        let mut cmd = Command::new(program[0]);
        cmd.args(&program[1..]).arg(url);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        for name in &changes.remove {
            cmd.env_remove(name);
        }
        for (name, value) in &changes.set {
            cmd.env(name, value);
        }
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                last_error = format!("{} could not be started: {e}", program[0]);
                continue;
            }
        };
        // A program that fails does so quickly. One that is still running after a moment has
        // handed the address to the browser (some stay until the browser closes).
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => return Ok(()),
                Ok(Some(status)) => {
                    last_error = format!("{} failed ({status})", program[0]);
                    break;
                }
                Ok(None) if Instant::now() >= deadline => {
                    std::thread::spawn(move || {
                        let _ = child.wait();
                    });
                    return Ok(());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(e) => {
                    last_error = format!("{} could not be checked: {e}", program[0]);
                    break;
                }
            }
        }
    }
    Err(AppError::Io(format!(
        "The link could not be opened ({last_error}). Copy the address and open it in a browser yourself."
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(name: &str, value: &str) -> (String, String) {
        (name.to_string(), value.to_string())
    }

    #[test]
    fn only_web_mail_and_phone_addresses_are_allowed() {
        assert!(is_allowed_url(
            "https://github.com/jkielsgaard/Mimer/issues/new?title=a%20b"
        ));
        assert!(is_allowed_url("HTTP://example.com"));
        assert!(is_allowed_url("mailto:me@example.com"));
        assert!(!is_allowed_url("file:///etc/passwd"));
        assert!(!is_allowed_url("javascript:alert(1)"));
        assert!(!is_allowed_url("https://a.com/ b"));
        assert!(!is_allowed_url("https://a.com/\n"));
        assert!(!is_allowed_url("ms-settings:"));
        assert!(check_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn appimage_variables_are_removed_and_lists_keep_the_rest() {
        let dir = "/tmp/.mount_MimerAb";
        let vars = vec![
            v("APPDIR", dir),
            v("GIO_MODULE_DIR", &format!("{dir}//usr/lib/gio/modules")),
            v("GTK_PATH", &format!("{dir}//usr/lib/gtk-3.0")),
            v(
                "XDG_DATA_DIRS",
                &format!("{dir}/usr/share:/usr/share:/usr/local/share"),
            ),
            v("LD_LIBRARY_PATH", &format!("{dir}/usr/lib")),
            v("HOME", "/home/me"),
            v("PATH", "/usr/bin:/bin"),
        ];
        let got = clean_env(&vars, dir);
        assert_eq!(
            got.remove,
            vec!["APPDIR", "GIO_MODULE_DIR", "GTK_PATH", "LD_LIBRARY_PATH"]
        );
        assert_eq!(
            got.set,
            vec![v("XDG_DATA_DIRS", "/usr/share:/usr/local/share")]
        );
    }

    #[test]
    fn nothing_changes_outside_an_appimage() {
        let vars = vec![v("HOME", "/home/me"), v("XDG_DATA_DIRS", "/usr/share")];
        assert_eq!(clean_env(&vars, ""), EnvChanges::default());
        assert_eq!(clean_env(&vars, "/tmp/.mount_x"), EnvChanges::default());
    }

    /// Opens a real page in the browser with AppImage-style variables set. Run by hand:
    /// `cargo test opens_a_real_link -- --ignored`.
    #[cfg(target_os = "linux")]
    #[test]
    #[ignore = "opens a browser window"]
    fn opens_a_real_link() {
        std::env::set_var("APPDIR", "/tmp/.mount_fake");
        std::env::set_var("GIO_MODULE_DIR", "/tmp/.mount_fake/usr/lib/gio/modules");
        open_linux("https://example.com/?from=mimer-test").unwrap();
    }
}
