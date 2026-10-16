//! A stand-alone test of Foundry Local (Microsoft's on-device AI runtime) for the Mimer project.
//!
//! It is NOT Mimer: it has its own name, keeps everything in a folder called `data` next to the
//! program, installs nothing and touches nothing of Mimer's (not the Store version, not its
//! settings or notes). It checks what Mimer needs to know before Foundry Local is built into it:
//! can the runtime start, which hardware (CPU, GPU, NPU) can it use, can a model be downloaded and
//! loaded, and does the model call a tool (that is how Mimer searches and changes notes)?
//!
//! The report is printed and also written to `foundry-test-report.txt` after every step, so the
//! file is useful even if the program stops in the middle.

use foundry_local_sdk::*;
use serde_json::json;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, Write};
use std::time::Instant;

struct Report {
    file: File,
}

impl Report {
    fn new() -> std::io::Result<Self> {
        Ok(Self {
            file: OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open("foundry-test-report.txt")?,
        })
    }

    /// Prints a line and saves it to the report at once.
    fn line(&mut self, text: impl AsRef<str>) {
        let text = text.as_ref();
        println!("{text}");
        let _ = writeln!(self.file, "{text}");
        let _ = self.file.flush();
        let _ = self.file.sync_data();
    }
}

fn os_info() -> String {
    #[cfg(windows)]
    {
        let ver = std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        let cpu = std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_default();
        format!("{ver} | {cpu}")
    }
    #[cfg(not(windows))]
    {
        std::env::consts::OS.to_string()
    }
}

async fn try_model(
    manager: &FoundryLocalManager,
    r: &mut Report,
    alias: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let catalog = manager.catalog();
    let model = catalog.get_model(alias).await?;
    let info = model.info()?;
    r.line(format!(
        "Model {alias}: variant {} | device {:?} | tools: {:?} | {} MB",
        model.id(),
        info.runtime.as_ref().map(|x| &x.device_type),
        info.supports_tool_calling,
        info.file_size_mb.unwrap_or(0)
    ));
    for v in model.variants() {
        let i = v.info()?;
        r.line(format!(
            "  variant {} | device {:?} | provider {:?} | cached {}",
            i.id,
            i.runtime.as_ref().map(|x| &x.device_type),
            i.runtime.as_ref().map(|x| &x.execution_provider),
            i.cached
        ));
    }

    let started = Instant::now();
    let last = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(101));
    let last2 = last.clone();
    model
        .download(Some(move |p: f64| {
            let step = (p / 10.0) as u64;
            if last2.swap(step, std::sync::atomic::Ordering::Relaxed) != step {
                println!("  download {p:.0}%");
            }
        }))
        .await?;
    r.line(format!("Downloaded in {:.0} s", started.elapsed().as_secs_f64()));

    let started = Instant::now();
    model.load().await?;
    r.line(format!("Loaded in {:.1} s", started.elapsed().as_secs_f64()));

    let tools: Vec<ChatCompletionTools> = serde_json::from_value(json!([{
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "Search the user's notes for a word or phrase",
            "parameters": {
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "required": ["query"]
            }
        }
    }]))?;
    let client = model
        .create_chat_client()
        .max_tokens(300)
        .temperature(0.3)
        .tool_choice(ChatToolChoice::Auto);

    let started = Instant::now();
    let plain: Vec<ChatCompletionRequestMessage> = vec![
        ChatCompletionRequestUserMessage::from("Say hello in one short sentence.").into(),
    ];
    let reply = client.complete_chat(&plain, None).await?;
    let text = reply.choices[0].message.content.clone().unwrap_or_default();
    r.line(format!(
        "Plain chat in {:.1} s: {}",
        started.elapsed().as_secs_f64(),
        text.replace('\n', " ")
    ));

    let started = Instant::now();
    let messages: Vec<ChatCompletionRequestMessage> = vec![
        ChatCompletionRequestSystemMessage::from(
            "You are a notes assistant. Use the tools to look things up.",
        )
        .into(),
        ChatCompletionRequestUserMessage::from("Find my notes about firewall rules.").into(),
    ];
    let reply = client.complete_chat(&messages, Some(&tools)).await?;
    let choice = &reply.choices[0];
    r.line(format!(
        "Tool test in {:.1} s: finish={:?} tool_calls={:?} text={:?}",
        started.elapsed().as_secs_f64(),
        choice.finish_reason,
        choice.message.tool_calls,
        choice.message.content
    ));
    let called = choice.message.tool_calls.as_ref().is_some_and(|t| !t.is_empty());
    r.line(format!(
        "RESULT for {alias}: {}",
        if called { "TOOL CALL WORKS" } else { "no tool call" }
    ));

    model.unload().await?;
    r.line("Unloaded.");
    Ok(())
}

#[tokio::main]
async fn main() {
    let mut r = match Report::new() {
        Ok(r) => r,
        Err(e) => {
            println!("Cannot write foundry-test-report.txt here: {e}. Move the folder to your Desktop or Documents.");
            return;
        }
    };
    r.line("Foundry Local test for the Mimer project (not Mimer; shares nothing with it)");
    r.line(format!("System: {}", os_info()));
    let folder = std::env::current_dir().unwrap_or_default();
    r.line(format!("Folder: {}", folder.display()));
    r.line("Everything this test downloads goes to the 'data' folder next to the program. Delete the folder to remove all of it.");

    let data = folder.join("data");
    let cfg = FoundryLocalConfig::new("FoundryLocalTest")
        .app_data_dir(data.join("app").to_string_lossy().to_string())
        .model_cache_dir(data.join("models").to_string_lossy().to_string())
        .logs_dir(data.join("logs").to_string_lossy().to_string());

    r.line("\n== Step 1: start the runtime ==");
    let manager = match FoundryLocalManager::create(cfg) {
        Ok(m) => {
            r.line("OK: the runtime started.");
            m
        }
        Err(e) => {
            r.line(format!("FAILED to start the runtime: {e}"));
            r.line("This is the most important thing to tell the developer. Is the program blocked by Windows or by security software? Are the .dll files next to the program?");
            wait();
            return;
        }
    };

    r.line("\n== Step 2: hardware (execution providers: NPU / GPU / CPU) ==");
    match manager.discover_eps() {
        Ok(eps) => {
            for ep in &eps {
                r.line(format!("  {} | registered: {}", ep.name, ep.is_registered));
            }
            if eps.is_empty() {
                r.line("  none found");
            }
            r.line("Downloading and registering the hardware providers (this may take a few minutes)...");
            let res = manager
                .download_and_register_eps_with_progress(None, |name: &str, pct: f64| {
                    if (pct as u64) % 25 == 0 {
                        println!("  {name} {pct:.0}%");
                    }
                })
                .await;
            match res {
                Ok(x) => r.line(format!("  result: success={} status={}", x.success, x.status)),
                Err(e) => r.line(format!("  FAILED: {e}")),
            }
            if let Ok(eps) = manager.discover_eps() {
                for ep in &eps {
                    r.line(format!("  now: {} | registered: {}", ep.name, ep.is_registered));
                }
            }
        }
        Err(e) => r.line(format!("  could not list the providers: {e}")),
    }

    r.line("\n== Step 3: the model catalog ==");
    match manager.catalog().get_models().await {
        Ok(models) => {
            r.line(format!("{} models in the catalog.", models.len()));
            let mut npu = Vec::new();
            let mut gpu = Vec::new();
            for m in &models {
                for v in m.variants() {
                    if let Ok(i) = v.info() {
                        let dev = i.runtime.as_ref().map(|x| format!("{:?}", x.device_type)).unwrap_or_default();
                        let label = format!("{} (tools {:?})", i.id, i.supports_tool_calling);
                        if dev == "NPU" {
                            npu.push(label);
                        } else if dev == "GPU" {
                            gpu.push(label);
                        }
                    }
                }
            }
            r.line(format!("Variants for NPU: {}", if npu.is_empty() { "none listed for this computer".into() } else { npu.join(", ") }));
            r.line(format!("Variants for GPU: {}", if gpu.is_empty() { "none listed for this computer".into() } else { gpu.join(", ") }));
        }
        Err(e) => {
            r.line(format!("FAILED to read the catalog: {e}. (Is the internet blocked?)"));
            wait();
            return;
        }
    }

    r.line("\n== Step 4: download a model and test it ==");
    let mut alias = std::env::args().nth(1).unwrap_or_else(|| "qwen3-0.6b".into());
    loop {
        r.line(format!("\n-- Testing model '{alias}' --"));
        if let Err(e) = try_model(&manager, &mut r, &alias).await {
            r.line(format!("FAILED: {e}"));
        }
        println!("\nType another model name to try it (for example phi-4-mini, qwen3-4b), or just press Enter to finish.");
        let mut next = String::new();
        if std::io::stdin().lock().read_line(&mut next).is_err() || next.trim().is_empty() {
            break;
        }
        alias = next.trim().to_string();
    }
    r.line("\nDone. Send the file foundry-test-report.txt to the developer.");
    let _ = manager.shutdown();
    wait();
}

fn wait() {
    println!("\nPress Enter to close.");
    let mut s = String::new();
    let _ = std::io::stdin().lock().read_line(&mut s);
}
