//! Windows only: puts the engine in a job object that kills it when Mimer ends, however it ends
//! (closed, crashed or killed in the Task Manager). The job handle is never closed by Mimer
//! itself: Windows closes it when the Mimer process is gone, and that kills everything in the job.

use std::os::windows::io::AsRawHandle;
use std::process::Child;
use std::sync::OnceLock;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

/// The job handle as a number (a raw handle cannot be kept in a static directly); 0 = none.
static JOB: OnceLock<usize> = OnceLock::new();

fn job() -> usize {
    *JOB.get_or_init(|| {
        // SAFETY: plain Windows API calls with valid arguments; the info struct is plain data.
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return 0;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                std::ptr::addr_of!(info).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                return 0;
            }
            handle as usize
        }
    })
}

/// Makes the child end when Mimer ends. Best effort: if it fails, Sleep and the pid file still
/// clean up in the normal cases.
pub fn keep_with_mimer(child: &Child) {
    let handle = job();
    if handle == 0 {
        tracing::warn!("could not create a job object for the engine");
        return;
    }
    // SAFETY: both handles are valid; the child handle belongs to a process we just started.
    let ok = unsafe { AssignProcessToJobObject(handle as _, child.as_raw_handle() as _) };
    if ok == 0 {
        tracing::warn!("could not add the engine to the job object");
    }
}
