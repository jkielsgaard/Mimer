//! API keys live in the OS keychain: service `mdvault`, account `provider:<id>`.

use crate::error::{AppError, AppResult};

const SERVICE: &str = "mdvault";

fn entry(provider_id: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, &format!("provider:{provider_id}"))
        .map_err(|e| AppError::Settings(format!("Keychain unavailable: {e}")))
}

/// Stores an API key for a provider.
pub fn set_key(provider_id: &str, key: &str) -> AppResult<()> {
    entry(provider_id)?
        .set_password(key)
        .map_err(|e| AppError::Settings(format!("Could not store API key: {e}")))
}

/// Reads the API key, if one is stored.
pub fn get_key(provider_id: &str) -> Option<String> {
    // The built-in AI has no stored key: it uses a random one made each time it is woken.
    if provider_id == crate::engine::BUILTIN_ID {
        return crate::engine::current_token();
    }
    entry(provider_id).ok()?.get_password().ok()
}

/// True when a key is stored.
pub fn has_key(provider_id: &str) -> bool {
    get_key(provider_id).is_some()
}

/// Removes the stored key (no error if none exists).
pub fn delete_key(provider_id: &str) -> AppResult<()> {
    match entry(provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Settings(format!("Could not delete API key: {e}"))),
    }
}
