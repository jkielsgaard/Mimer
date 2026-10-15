//! Turns "the engine stopped" into something the user can act on: a title, numbered steps and the
//! engine's own last lines. The patterns come from what llama.cpp, CUDA, Vulkan and Windows
//! really print.

use super::hardware::{Backend, Os};
use super::Problem;

/// What is known about the failed start, to make the advice specific.
#[derive(Debug, Clone)]
pub struct Context {
    pub os: Os,
    pub backend: Backend,
    pub port: u16,
    pub context_tokens: u32,
}

fn steps(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| (*s).to_string()).collect()
}

/// The last `n` lines of the log, one per line.
pub fn tail(log: &[String], n: usize) -> String {
    let start = log.len().saturating_sub(n);
    log[start..].join("\n")
}

fn any(log: &[String], needles: &[&str]) -> bool {
    log.iter().any(|l| {
        let l = l.to_lowercase();
        needles.iter().any(|n| l.contains(n))
    })
}

fn problem(title: &str, list: &[&str], details: String) -> Problem {
    Problem {
        title: title.to_string(),
        steps: steps(list),
        details,
    }
}

/// Explains a stop. `exit_code` is the exit code of the engine (on Windows the error code such as
/// `0xC0000135` is shown as a negative number, so both forms are understood); `log` is what the
/// engine printed.
pub fn diagnose(exit_code: Option<i32>, log: &[String], ctx: &Context) -> Problem {
    let code_text = exit_code.map_or("none".to_string(), |c| format!("{c} (0x{:08X})", c as u32));
    let details = format!(
        "Exit code: {code_text}\nEngine: {} ({:?})\n\n{}",
        ctx.backend.id(),
        ctx.os,
        tail(log, 40)
    );
    let code = exit_code.map(|c| c as u32);

    if any(
        log,
        &[
            "address already in use",
            "couldn't bind",
            "failed to bind",
            "bind failed",
        ],
    ) {
        return problem(
            "The port is already in use",
            &[
                &format!("Another program is using port {}.", ctx.port),
                "Press Wake Mimer again: Mimer picks a new free port each time.",
                "If it keeps happening, close programs that listen on network ports, or restart the computer.",
            ],
            details,
        );
    }
    if any(
        log,
        &[
            "out of memory",
            "failed to allocate",
            "cudamalloc failed",
            "erroroutofdevicememory",
            "erroroutofhostmemory",
            "unable to allocate",
            "not enough memory",
            "std::bad_alloc",
            "failed to create context",
            "allocate buffer",
        ],
    ) || code == Some(0xC000_0017)
        || exit_code == Some(137)
        || exit_code == Some(-9)
    {
        return problem(
            "Not enough memory to load the model",
            &[
                "Close other programs that use a lot of memory (browsers, virtual machines, other AI programs such as LM Studio) and try again.",
                &format!(
                    "Lower the context size in Settings → Built-in AI (now {}). A smaller context uses much less memory.",
                    ctx.context_tokens
                ),
                "Under Graphics card use, choose a lower number of layers, or CPU only, to use ordinary memory instead of the graphics card's memory.",
                "Or choose a smaller model (Gemma 4 E4B or E2B) and download it.",
            ],
            details,
        );
    }
    if any(
        log,
        &[
            "cuda driver version is insufficient",
            "no cuda-capable device",
            "cuda error",
            "cudagetdevicecount",
            "cuda failed",
            "nvcuda.dll",
            "libcuda.so",
        ],
    ) {
        return problem(
            "The Nvidia graphics driver does not work with this engine",
            &[
                "Update the Nvidia graphics driver to the latest version and restart the computer.",
                "If it still fails, choose the engine \"Graphics card (Vulkan)\" in Settings → Built-in AI and download it.",
                "Or choose \"CPU only\", which works without any graphics driver.",
            ],
            details,
        );
    }
    if any(
        log,
        &[
            "vkcreateinstance",
            "no vulkan",
            "failed to initialize vulkan",
            "ggml_vulkan: no devices",
            "vulkan: no devices",
            "vulkan instance",
            "errorincompatibledriver",
            "errorinitializationfailed",
            "failed to find a vulkan",
        ],
    ) {
        return problem(
            "The graphics card could not be started through Vulkan",
            &[
                "Update the graphics driver (AMD, Intel or Nvidia) and restart the computer.",
                "On Linux, install the Vulkan driver for your card (for example mesa-vulkan-drivers, or the Nvidia driver).",
                "If it still fails, choose \"CPU only\" in Settings → Built-in AI and download that engine.",
            ],
            details,
        );
    }
    if code == Some(0xC000_0135)
        || any(log, &["dll not found", "the code execution cannot proceed"])
    {
        return problem(
            "A Windows runtime file is missing",
            &[
                "Install \"Microsoft Visual C++ Redistributable 2015-2022 (x64)\" from Microsoft and try again.",
                "If you use an Nvidia engine, update the Nvidia driver too.",
                "If it still fails, use Remove files, then download the engine again: an antivirus program may have removed part of it.",
            ],
            details,
        );
    }
    if any(
        log,
        &[
            "error while loading shared libraries",
            "cannot open shared object file",
        ],
    ) {
        let lib = log
            .iter()
            .find(|l| {
                l.to_lowercase().contains("shared object")
                    || l.to_lowercase().contains("shared libraries")
            })
            .cloned()
            .unwrap_or_default();
        return problem(
            "A system library is missing",
            &[
                &format!("The engine needs a library that is not installed: {lib}"),
                "Install the package that provides it (the name is in the line above), then press Wake Mimer again.",
                "For a graphics engine, the graphics driver packages must be installed. \"CPU only\" needs no extra libraries.",
            ],
            details,
        );
    }
    if code == Some(0xC000_007B) || code == Some(0xC000_001D) {
        return problem(
            "The engine does not fit this computer",
            &[
                "The program was stopped by the processor or Windows (bad image or an unsupported instruction).",
                "Choose \"CPU only\" or \"Graphics card (Vulkan)\" in Settings → Built-in AI and download it.",
            ],
            details,
        );
    }
    if any(
        log,
        &[
            "unknown model architecture",
            "unknown architecture",
            "unsupported model",
            "unknown tensor type",
        ],
    ) {
        return problem(
            "The engine is too old for this model",
            &[
                "The model needs a newer engine than the one installed.",
                "Update Mimer, which comes with a newer engine, then download the engine again.",
                "Or choose another model.",
            ],
            details,
        );
    }
    if any(
        log,
        &[
            "failed to load model",
            "error loading model",
            "invalid magic",
            "gguf_init_from_file",
            "tensor data is not within",
            "model file is corrupt",
            "failed to read magic",
        ],
    ) {
        return problem(
            "The model file could not be read",
            &[
                "The file may be damaged or incomplete.",
                "Use Remove model in Settings → Built-in AI, then download it again (it is checked with a checksum).",
                "If you added your own .gguf file, check that it is a complete GGUF model.",
            ],
            details,
        );
    }
    if any(
        log,
        &["permission denied", "access is denied", "access denied"],
    ) {
        return problem(
            "The engine is not allowed to run",
            &[
                "Security software may be blocking the program. Allow \"llama-server\" in your antivirus or security program.",
                "On Linux, check that the folder is not mounted with the noexec option.",
                "Then press Wake Mimer again.",
            ],
            details,
        );
    }
    if exit_code.is_none() || exit_code == Some(0) {
        return problem(
            "The engine stopped without saying why",
            &[
                "Press Wake Mimer again.",
                "If it keeps happening, open Show details and look at the last lines.",
            ],
            details,
        );
    }
    problem(
        "The engine stopped",
        &[
            "Press Wake Mimer again.",
            "Look at the last lines under Show details: they usually say what is wrong.",
            "If a graphics engine fails, try \"CPU only\" in Settings → Built-in AI to see if the model itself works.",
        ],
        details,
    )
}

/// Explains why the engine program could not be started at all.
pub fn diagnose_spawn(error: &std::io::Error, program: &std::path::Path) -> Problem {
    let details = format!("{}\n{error}", program.display());
    match error.kind() {
        std::io::ErrorKind::NotFound => problem(
            "The engine program is missing",
            &[
                "The files of the engine are not where Mimer expects them.",
                "Security software may have removed the program. Allow \"llama-server\" in your antivirus program.",
                "Use Remove files in Settings → Built-in AI, then download the engine again.",
            ],
            details,
        ),
        std::io::ErrorKind::PermissionDenied => problem(
            "The engine is not allowed to run",
            &[
                "Security software or a folder setting is blocking the program.",
                "Allow \"llama-server\" in your antivirus program, and on Linux check that the folder is not mounted noexec.",
                "Then press Wake Mimer again.",
            ],
            details,
        ),
        _ => problem(
            "The engine could not be started",
            &[
                "Press Wake Mimer again.",
                "If it keeps happening, use Remove files and download the engine again.",
            ],
            details,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> Context {
        Context {
            os: Os::Linux,
            backend: Backend::Vulkan,
            port: 8123,
            context_tokens: 16_384,
        }
    }

    fn log(lines: &[&str]) -> Vec<String> {
        lines.iter().map(|s| (*s).to_string()).collect()
    }

    fn title(code: Option<i32>, lines: &[&str]) -> String {
        diagnose(code, &log(lines), &ctx()).title
    }

    #[test]
    fn running_out_of_memory_suggests_a_smaller_context_and_model() {
        for line in [
            "ggml_vulkan: vk::Device::allocateMemory: ErrorOutOfDeviceMemory",
            "llama_init_from_model: failed to allocate compute buffers",
            "CUDA error: out of memory",
            "terminate called after throwing an instance of 'std::bad_alloc'",
        ] {
            let p = diagnose(Some(1), &log(&[line]), &ctx());
            assert_eq!(p.title, "Not enough memory to load the model", "{line}");
            assert!(p
                .steps
                .iter()
                .any(|s| s.contains("context size") && s.contains("16384")));
            assert!(p.steps.iter().any(|s| s.contains("smaller model")));
        }
        // Killed by the system (the out-of-memory killer) is the same problem.
        assert_eq!(title(Some(137), &[]), "Not enough memory to load the model");
    }

    #[test]
    fn a_busy_port_tells_which_port_and_what_to_do() {
        let p = diagnose(Some(1), &log(&["couldn't bind HTTP server socket"]), &ctx());
        assert_eq!(p.title, "The port is already in use");
        assert!(p.steps[0].contains("8123"));
    }

    #[test]
    fn graphics_driver_problems_point_to_drivers_and_to_other_engines() {
        let v = diagnose(Some(1), &log(&["ggml_vulkan: No devices found."]), &ctx());
        assert!(v.title.contains("Vulkan"));
        assert!(v.steps.iter().any(|s| s.contains("CPU only")));
        let c = diagnose(
            Some(1),
            &log(&["CUDA error: CUDA driver version is insufficient for CUDA runtime version"]),
            &ctx(),
        );
        assert!(c.title.contains("Nvidia"));
        assert!(c.steps.iter().any(|s| s.contains("Vulkan")));
    }

    #[test]
    fn windows_missing_dll_is_recognised_from_the_error_code() {
        // 0xC0000135 = STATUS_DLL_NOT_FOUND, shown as a negative number by some APIs.
        let p = diagnose(Some(0xC000_0135u32 as i32), &[], &ctx());
        assert_eq!(p.title, "A Windows runtime file is missing");
        assert!(p.steps[0].contains("Visual C++"));
        assert!(p.details.contains("0xC0000135"));
    }

    #[test]
    fn a_missing_linux_library_names_the_library() {
        let p = diagnose(
            Some(127),
            &log(&["./llama-server: error while loading shared libraries: libvulkan.so.1: cannot open shared object file"]),
            &ctx(),
        );
        assert_eq!(p.title, "A system library is missing");
        assert!(p.steps[0].contains("libvulkan.so.1"));
    }

    #[test]
    fn model_problems_are_told_apart() {
        assert_eq!(
            title(Some(1), &["llama_model_load: error loading model architecture: unknown model architecture: 'gemma9'"]),
            "The engine is too old for this model"
        );
        assert_eq!(
            title(Some(1), &["gguf_init_from_file: invalid magic characters"]),
            "The model file could not be read"
        );
    }

    #[test]
    fn permissions_and_unknown_failures_still_give_steps_and_details() {
        assert_eq!(
            title(Some(126), &["bash: ./llama-server: Permission denied"]),
            "The engine is not allowed to run"
        );
        let p = diagnose(Some(3), &log(&["something odd", "another line"]), &ctx());
        assert_eq!(p.title, "The engine stopped");
        assert!(p.details.contains("something odd"));
        assert!(!p.steps.is_empty());
    }

    #[test]
    fn details_contain_only_the_last_forty_lines() {
        let many: Vec<String> = (0..100).map(|i| format!("line {i}")).collect();
        let p = diagnose(Some(1), &many, &ctx());
        assert!(p.details.contains("line 99"));
        assert!(!p.details.contains("line 10\n"));
        assert!(p.details.contains("line 60"));
        assert!(!p.details.contains("line 59\n"));
    }

    #[test]
    fn a_program_that_cannot_be_started_is_explained() {
        let e = std::io::Error::from(std::io::ErrorKind::NotFound);
        let p = diagnose_spawn(&e, std::path::Path::new("/x/llama-server"));
        assert_eq!(p.title, "The engine program is missing");
        assert!(p.steps.iter().any(|s| s.contains("antivirus")));
        let e = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        assert_eq!(
            diagnose_spawn(&e, std::path::Path::new("x")).title,
            "The engine is not allowed to run"
        );
    }
}
