//! Downloads one file: it can be resumed, it is checked against a size and a SHA-256, and it only
//! gets its final name when it is complete and correct.

use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

/// What to download and what it must be.
#[derive(Debug, Clone)]
pub struct DownloadSpec {
    pub url: String,
    pub dest: PathBuf,
    /// The exact size the file must have.
    pub size: u64,
    /// The SHA-256 (lower-case hex) the file must have. `None` skips the check.
    pub sha256: Option<String>,
}

/// SHA-256 (hex) of the whole file.
pub fn sha256_of(path: &Path) -> AppResult<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    dest.with_file_name(name)
}

/// What a problem while downloading looks like to the user.
fn network_error(url: &str, e: &reqwest::Error) -> AppError {
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| url.to_string());
    let why = if e.is_timeout() {
        "the connection timed out"
    } else if e.is_connect() {
        "the connection could not be made"
    } else {
        "the connection was lost"
    };
    AppError::Provider(format!(
        "The download from {host} failed: {why}. Check the internet connection (and any proxy or firewall that blocks {host}), then press Download again: it continues where it stopped."
    ))
}

fn write_error(path: &Path, e: &std::io::Error) -> AppError {
    let full = e.raw_os_error() == Some(28) || e.raw_os_error() == Some(112); // ENOSPC, ERROR_DISK_FULL
    if full {
        AppError::Io(format!(
            "The disk is full: there is no room to save {}. Free some space and press Download again.",
            path.display()
        ))
    } else {
        AppError::Io(format!("Cannot write {}: {e}", path.display()))
    }
}

/// Downloads `spec.url` to `spec.dest`.
///
/// A file that is already there with the right size is kept. A half-finished download
/// (`<name>.part`) is continued. `progress(done, total)` is called a few times a second.
/// Cancelling keeps the half-finished file so the next try can continue.
pub async fn download(
    client: &reqwest::Client,
    spec: &DownloadSpec,
    cancel: &CancellationToken,
    progress: &(dyn Fn(u64, u64) + Send + Sync),
) -> AppResult<()> {
    if std::fs::metadata(&spec.dest).is_ok_and(|m| m.len() == spec.size) {
        progress(spec.size, spec.size);
        return Ok(());
    }
    if let Some(dir) = spec.dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| write_error(dir, &e))?;
    }
    let part = part_path(&spec.dest);
    let mut hasher = Sha256::new();
    let mut have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    if have > spec.size {
        let _ = std::fs::remove_file(&part);
        have = 0;
    }
    // Continue a half-finished file: hash what is already there first.
    if have > 0 {
        let mut f = std::fs::File::open(&part)?;
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
    }

    let mut request = client.get(&spec.url);
    if have > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let response = request
        .send()
        .await
        .map_err(|e| network_error(&spec.url, &e))?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::Provider(format!(
            "The server answered {status} for {}. The file may have been moved. Try again later, and if it keeps happening, update Mimer.",
            spec.url
        )));
    }
    // A server that ignores the range sends the whole file again: start over.
    if have > 0 && status != reqwest::StatusCode::PARTIAL_CONTENT {
        have = 0;
        hasher = Sha256::new();
    }
    let mut out = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(have > 0)
        .truncate(have == 0)
        .open(&part)
        .map_err(|e| write_error(&part, &e))?;

    let mut done = have;
    let mut last = Instant::now();
    progress(done, spec.size);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.is_cancelled() {
            return Err(AppError::Provider("The download was cancelled".into()));
        }
        let chunk = chunk.map_err(|e| network_error(&spec.url, &e))?;
        out.write_all(&chunk).map_err(|e| write_error(&part, &e))?;
        hasher.update(&chunk);
        done += chunk.len() as u64;
        if last.elapsed() >= Duration::from_millis(250) {
            progress(done, spec.size);
            last = Instant::now();
        }
    }
    out.flush().map_err(|e| write_error(&part, &e))?;
    drop(out);

    if done != spec.size {
        // Keep the part: the next try continues from here.
        return Err(AppError::Provider(format!(
            "The download stopped early ({done} of {} bytes). Press Download again: it continues where it stopped.",
            spec.size
        )));
    }
    if let Some(expected) = &spec.sha256 {
        let got = hex(&hasher.finalize());
        if &got != expected {
            let _ = std::fs::remove_file(&part);
            return Err(AppError::Provider(format!(
                "The downloaded file is damaged or has been changed: its checksum is {got}, but Mimer expects {expected}. The file was deleted. Press Download again. If it keeps happening, something on the network may be changing the file."
            )));
        }
    }
    std::fs::rename(&part, &spec.dest).map_err(|e| write_error(&spec.dest, &e))?;
    progress(done, spec.size);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;

    /// A small HTTP server that serves `body`, understands `Range: bytes=N-`, and stops after
    /// `max_requests` requests. Returns its address.
    fn serve(body: Vec<u8>, max_requests: usize, cut_first_at: Option<usize>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for n in 0..max_requests {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut start = 0usize;
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok() {
                    if line == "\r\n" || line.is_empty() {
                        break;
                    }
                    if let Some(r) = line.to_lowercase().strip_prefix("range: bytes=") {
                        start = r.trim().trim_end_matches('-').parse().unwrap_or(0);
                    }
                    line.clear();
                }
                let slice = &body[start..];
                let (status, extra) = if start > 0 {
                    (
                        "206 Partial Content",
                        format!(
                            "Content-Range: bytes {start}-{}/{}\r\n",
                            body.len() - 1,
                            body.len()
                        ),
                    )
                } else {
                    ("200 OK", String::new())
                };
                let head = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n",
                    slice.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let send = match (n, cut_first_at) {
                    (0, Some(cut)) => &slice[..cut.min(slice.len())],
                    _ => slice,
                };
                let _ = stream.write_all(send);
            }
        });
        format!("http://{addr}/file.bin")
    }

    fn sha(bytes: &[u8]) -> String {
        let mut h = Sha256::new();
        h.update(bytes);
        hex(&h.finalize())
    }

    fn client() -> reqwest::Client {
        reqwest::Client::builder().build().unwrap()
    }

    fn body() -> Vec<u8> {
        (0..200_000u32).map(|i| (i % 251) as u8).collect()
    }

    #[tokio::test]
    async fn a_complete_download_is_checked_and_gets_its_final_name() {
        let b = body();
        let url = serve(b.clone(), 1, None);
        let dir = tempfile::tempdir().unwrap();
        let spec = DownloadSpec {
            url,
            dest: dir.path().join("m.gguf"),
            size: b.len() as u64,
            sha256: Some(sha(&b)),
        };
        download(&client(), &spec, &CancellationToken::new(), &|_, _| {})
            .await
            .unwrap();
        assert_eq!(std::fs::read(&spec.dest).unwrap(), b);
        assert!(!part_path(&spec.dest).exists());
        assert_eq!(sha256_of(&spec.dest).unwrap(), sha(&b));
    }

    #[tokio::test]
    async fn a_wrong_checksum_deletes_the_file_and_explains() {
        let b = body();
        let url = serve(b.clone(), 1, None);
        let dir = tempfile::tempdir().unwrap();
        let spec = DownloadSpec {
            url,
            dest: dir.path().join("m.gguf"),
            size: b.len() as u64,
            sha256: Some("0".repeat(64)),
        };
        let err = download(&client(), &spec, &CancellationToken::new(), &|_, _| {})
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("damaged or has been changed"),
            "{err}"
        );
        assert!(!spec.dest.exists());
        assert!(!part_path(&spec.dest).exists());
    }

    #[tokio::test]
    async fn an_interrupted_download_continues_where_it_stopped() {
        let b = body();
        // The first answer is cut off after 50,000 bytes, the second one honours the range.
        let url = serve(b.clone(), 2, Some(50_000));
        let dir = tempfile::tempdir().unwrap();
        let spec = DownloadSpec {
            url,
            dest: dir.path().join("m.gguf"),
            size: b.len() as u64,
            sha256: Some(sha(&b)),
        };
        let first = download(&client(), &spec, &CancellationToken::new(), &|_, _| {}).await;
        assert!(first.is_err(), "the cut-off download must fail");
        let kept = std::fs::metadata(part_path(&spec.dest)).unwrap().len();
        assert!(kept > 0 && kept < b.len() as u64);
        download(&client(), &spec, &CancellationToken::new(), &|_, _| {})
            .await
            .unwrap();
        assert_eq!(std::fs::read(&spec.dest).unwrap(), b);
    }

    #[tokio::test]
    async fn a_file_that_is_already_there_is_not_downloaded_again() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("m.gguf");
        std::fs::write(&dest, b"12345").unwrap();
        let spec = DownloadSpec {
            url: "http://127.0.0.1:1/never".into(),
            dest,
            size: 5,
            sha256: None,
        };
        download(&client(), &spec, &CancellationToken::new(), &|_, _| {})
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn an_unreachable_server_gives_a_message_that_says_what_to_check() {
        let dir = tempfile::tempdir().unwrap();
        let spec = DownloadSpec {
            url: "http://127.0.0.1:1/never".into(),
            dest: dir.path().join("m.gguf"),
            size: 10,
            sha256: None,
        };
        let err = download(&client(), &spec, &CancellationToken::new(), &|_, _| {})
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("Check the internet connection"), "{err}");
    }
}
