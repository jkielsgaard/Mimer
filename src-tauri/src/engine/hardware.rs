//! What the computer has: operating system, CPU, graphics cards and memory. Detection is a best
//! effort that only pre-selects the choices in the settings; the user always has the last word.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Who made the CPU.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CpuVendor {
    Amd,
    Intel,
    Other,
}

/// Who made the graphics card (`None`: use the CPU only).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    None,
}

/// Which build of the engine to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Backend {
    /// No graphics card; runs on the CPU.
    Cpu,
    /// Any modern graphics card (AMD, Intel, Nvidia) through the Vulkan driver.
    Vulkan,
    /// Nvidia, with CUDA 12 (works with most drivers).
    Cuda12,
    /// Nvidia, with CUDA 13 (needs a recent driver).
    Cuda13,
    /// AMD, with ROCm.
    Rocm,
    /// Intel, with SYCL.
    Sycl,
}

impl Backend {
    /// The short name used in folder names and settings (`vulkan`, `cuda12`, …).
    pub const fn id(self) -> &'static str {
        match self {
            Backend::Cpu => "cpu",
            Backend::Vulkan => "vulkan",
            Backend::Cuda12 => "cuda12",
            Backend::Cuda13 => "cuda13",
            Backend::Rocm => "rocm",
            Backend::Sycl => "sycl",
        }
    }
}

/// The operating systems the built-in AI supports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Os {
    Windows,
    Linux,
    Unsupported,
}

/// The operating system Mimer is running on.
pub const fn current_os() -> Os {
    if cfg!(windows) {
        Os::Windows
    } else if cfg!(target_os = "linux") {
        Os::Linux
    } else {
        Os::Unsupported
    }
}

/// One graphics card.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GpuInfo {
    pub vendor: GpuVendor,
    pub name: String,
}

/// What was found on this computer.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HardwareInfo {
    pub os: Os,
    pub cpu_vendor: CpuVendor,
    pub cpu_name: String,
    /// Logical processors.
    pub cpu_threads: u32,
    pub gpus: Vec<GpuInfo>,
    /// Installed memory in whole GB, when it could be read.
    pub ram_gb: Option<u32>,
    /// The graphics card that is best to use (Nvidia before AMD before Intel), or `None`.
    pub recommended_gpu: GpuVendor,
}

/// The engine build that suits a graphics card best.
pub fn default_backend(gpu: GpuVendor) -> Backend {
    match gpu {
        GpuVendor::Nvidia => Backend::Cuda12,
        GpuVendor::Amd | GpuVendor::Intel => Backend::Vulkan,
        GpuVendor::None => Backend::Cpu,
    }
}

/// The CPU vendor from a vendor string such as `AuthenticAMD` or `GenuineIntel`.
pub fn cpu_vendor_from(text: &str) -> CpuVendor {
    let t = text.to_lowercase();
    if t.contains("authenticamd") || t.contains("amd") {
        CpuVendor::Amd
    } else if t.contains("genuineintel") || t.contains("intel") {
        CpuVendor::Intel
    } else {
        CpuVendor::Other
    }
}

/// Reads the vendor and model name from the text of `/proc/cpuinfo`.
pub fn parse_cpuinfo(text: &str) -> (CpuVendor, String) {
    let field = |key: &str| {
        text.lines()
            .find(|l| l.starts_with(key))
            .and_then(|l| l.split_once(':'))
            .map(|(_, v)| v.trim().to_string())
    };
    let name = field("model name").unwrap_or_default();
    let vendor = field("vendor_id").unwrap_or_default();
    (cpu_vendor_from(&format!("{vendor} {name}")), name)
}

/// The graphics card vendor for a PCI vendor id such as `0x10de`.
pub fn gpu_vendor_from_pci(id: &str) -> Option<GpuVendor> {
    match id.trim().to_lowercase().trim_start_matches("0x") {
        "10de" => Some(GpuVendor::Nvidia),
        "1002" => Some(GpuVendor::Amd),
        "8086" => Some(GpuVendor::Intel),
        _ => None,
    }
}

/// Graphics cards from the names Windows reports (one per line).
pub fn parse_gpu_names(text: &str) -> Vec<GpuInfo> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .filter_map(|name| {
            let n = name.to_lowercase();
            let vendor = if n.contains("nvidia") || n.contains("geforce") || n.contains("quadro") {
                GpuVendor::Nvidia
            } else if n.contains("amd") || n.contains("radeon") || n.contains("ati ") {
                GpuVendor::Amd
            } else if n.contains("intel") {
                GpuVendor::Intel
            } else {
                return None;
            };
            Some(GpuInfo {
                vendor,
                name: name.to_string(),
            })
        })
        .collect()
}

/// Whole GB of memory from the text of `/proc/meminfo`.
pub fn parse_meminfo_gb(text: &str) -> Option<u32> {
    let kb: u64 = text
        .lines()
        .find(|l| l.starts_with("MemTotal:"))?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()?;
    u32::try_from((kb + 524_288) / 1_048_576).ok()
}

/// The best of several graphics cards: Nvidia, then AMD, then Intel.
pub fn best_gpu(gpus: &[GpuInfo]) -> GpuVendor {
    [GpuVendor::Nvidia, GpuVendor::Amd, GpuVendor::Intel]
        .into_iter()
        .find(|v| gpus.iter().any(|g| g.vendor == *v))
        .unwrap_or(GpuVendor::None)
}

type Found = (CpuVendor, String, Vec<GpuInfo>, Option<u32>);

#[cfg(target_os = "linux")]
fn detect_platform() -> Found {
    let (cpu, name) = std::fs::read_to_string("/proc/cpuinfo")
        .map(|t| parse_cpuinfo(&t))
        .unwrap_or((CpuVendor::Other, String::new()));
    let mut gpus = Vec::new();
    if let Ok(read) = std::fs::read_dir("/sys/class/drm") {
        let mut cards: Vec<String> = read
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            // Only the card itself (`card0`), not its connectors (`card0-HDMI-A-1`).
            .filter(|n| n.starts_with("card") && !n.contains('-'))
            .collect();
        cards.sort();
        for card in cards {
            let vendor_file = format!("/sys/class/drm/{card}/device/vendor");
            let Some(vendor) = std::fs::read_to_string(vendor_file)
                .ok()
                .and_then(|v| gpu_vendor_from_pci(&v))
            else {
                continue;
            };
            let label = match vendor {
                GpuVendor::Nvidia => "Nvidia graphics card",
                GpuVendor::Amd => "AMD graphics card",
                _ => "Intel graphics",
            };
            gpus.push(GpuInfo {
                vendor,
                name: label.to_string(),
            });
        }
    }
    let ram = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|t| parse_meminfo_gb(&t));
    (cpu, name, gpus, ram)
}

#[cfg(windows)]
fn powershell(command: &str) -> String {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: no console window flashes up.
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", command])
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

#[cfg(windows)]
fn detect_platform() -> Found {
    let ident = std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_default();
    let name = powershell("(Get-CimInstance Win32_Processor | Select-Object -First 1).Name")
        .trim()
        .to_string();
    let cpu = cpu_vendor_from(&format!("{ident} {name}"));
    let gpus = parse_gpu_names(&powershell(
        "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }",
    ));
    let ram = powershell("(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory")
        .trim()
        .parse::<u64>()
        .ok()
        .and_then(|b| u32::try_from((b + 536_870_912) / 1_073_741_824).ok());
    (cpu, name, gpus, ram)
}

#[cfg(not(any(target_os = "linux", windows)))]
fn detect_platform() -> Found {
    (CpuVendor::Other, String::new(), Vec::new(), None)
}

/// Looks at this computer. Never fails: what cannot be found is left out.
pub fn detect() -> HardwareInfo {
    let (cpu_vendor, cpu_name, gpus, ram_gb) = detect_platform();
    let cpu_threads = std::thread::available_parallelism()
        .map(|n| u32::try_from(n.get()).unwrap_or(1))
        .unwrap_or(1);
    HardwareInfo {
        os: current_os(),
        cpu_vendor,
        cpu_name,
        cpu_threads,
        recommended_gpu: best_gpu(&gpus),
        gpus,
        ram_gb,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_vendor_is_read_from_the_vendor_string() {
        assert_eq!(cpu_vendor_from("AuthenticAMD"), CpuVendor::Amd);
        assert_eq!(cpu_vendor_from("GenuineIntel"), CpuVendor::Intel);
        assert_eq!(
            cpu_vendor_from("Intel64 Family 6 Model 186, GenuineIntel"),
            CpuVendor::Intel
        );
        assert_eq!(
            cpu_vendor_from("AMD64 Family 26 Model 112, AuthenticAMD"),
            CpuVendor::Amd
        );
        assert_eq!(cpu_vendor_from("Apple M3"), CpuVendor::Other);
    }

    #[test]
    fn cpuinfo_gives_vendor_and_name() {
        let text = "processor : 0\nvendor_id : AuthenticAMD\nmodel name : AMD Ryzen AI 7 PRO 350 w/ Radeon 860M\n";
        let (v, n) = parse_cpuinfo(text);
        assert_eq!(v, CpuVendor::Amd);
        assert_eq!(n, "AMD Ryzen AI 7 PRO 350 w/ Radeon 860M");
        assert_eq!(parse_cpuinfo("").0, CpuVendor::Other);
    }

    #[test]
    fn pci_ids_map_to_graphics_vendors() {
        assert_eq!(gpu_vendor_from_pci("0x10de\n"), Some(GpuVendor::Nvidia));
        assert_eq!(gpu_vendor_from_pci("0x1002"), Some(GpuVendor::Amd));
        assert_eq!(gpu_vendor_from_pci("0x8086"), Some(GpuVendor::Intel));
        assert_eq!(gpu_vendor_from_pci("0x1234"), None);
    }

    #[test]
    fn windows_gpu_names_are_sorted_into_vendors() {
        let g = parse_gpu_names(
            "Intel(R) Iris(R) Xe Graphics\r\nNVIDIA GeForce RTX 4060 Laptop GPU\n\nAMD Radeon(TM) 860M Graphics\nMicrosoft Basic Display Adapter\n",
        );
        let v: Vec<GpuVendor> = g.iter().map(|x| x.vendor).collect();
        assert_eq!(v, vec![GpuVendor::Intel, GpuVendor::Nvidia, GpuVendor::Amd]);
        assert_eq!(best_gpu(&g), GpuVendor::Nvidia);
        assert_eq!(best_gpu(&[]), GpuVendor::None);
    }

    #[test]
    fn memory_is_rounded_to_whole_gb() {
        assert_eq!(
            parse_meminfo_gb("MemTotal:       32621872 kB\nMemFree: 1 kB\n"),
            Some(31)
        );
        assert_eq!(parse_meminfo_gb("MemTotal: 65536000 kB"), Some(63));
        assert_eq!(parse_meminfo_gb("nothing"), None);
    }

    #[test]
    fn each_graphics_vendor_has_a_default_engine() {
        assert_eq!(default_backend(GpuVendor::Nvidia), Backend::Cuda12);
        assert_eq!(default_backend(GpuVendor::Amd), Backend::Vulkan);
        assert_eq!(default_backend(GpuVendor::Intel), Backend::Vulkan);
        assert_eq!(default_backend(GpuVendor::None), Backend::Cpu);
    }

    #[test]
    fn detect_does_not_panic_and_reports_the_os() {
        let h = detect();
        assert_eq!(h.os, current_os());
        assert!(h.cpu_threads >= 1);
    }
}
