> **Status: idea for later (after 0.7.0).** Not planned in detail. Build it only when the note AI has proved useful with LM Studio.

# Feature 17 – A built-in local AI, so LM Studio is not needed

## Goal

The notes AI (Mimer) works out of the box: Mimer downloads a model the user picks and runs it on the user's own computer. LM Studio stays supported as an ordinary provider.

## Starting point (to be confirmed before it is built)

| Question          | Direction                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine            | `llama.cpp`'s `llama-server`, started by Mimer as a hidden background program (a Tauri sidecar). It already speaks the OpenAI-compatible API that Mimer uses for LM Studio, so it becomes one more provider kind, "Built-in". |
| Locality          | It listens on `127.0.0.1` only, on a random port, and Mimer never offers it on the network. It counts as local under the loopback rule from feature 16.                                                                       |
| GPU and CPU       | Ship or download the engine in a few builds (CPU, Vulkan for AMD/Nvidia/Intel, later CUDA) and pick the best one at start; fall back to CPU. Must work on Windows and Linux. macOS is not built for now.                      |
| Model             | Downloaded on first use from Hugging Face as a GGUF file, with a checksum, progress, pause and resume. A recommended model (a Gemma 4 QAT size; **check the model card for the real sizes**) and an "I have my own" option.   |
| Light or heavy PC | Show the size and the memory a model needs before it is downloaded, and suggest a lighter or heavier one from the machine's RAM and GPU.                                                                                      |
| Tools             | Tool calls need the model's chat template. Test each recommended model; if tools do not work, Mimer falls back to chat without tools and says so.                                                                             |
| Install rights    | Everything lives in the user's own app data folder, no administrator rights.                                                                                                                                                  |
| Licence           | Models have their own terms (Gemma has its own, not Apache). Show them before the download, and never put a model inside the installer.                                                                                       |

## Open questions

- Ship the engine inside the installer (bigger, works offline) or download it on first use (smaller)?
- Which models are recommended, and how often is the list updated?
- Updates of the engine: how does the user get a newer `llama.cpp` without a new Mimer?
- How is it tested on different CPUs and GPUs when only some hardware is at hand?

## Definition of done (when it is planned)

As in [README.md](README.md), plus a test on at least one machine per supported OS and GPU vendor, and the first-run experience described step by step in the user guide.
