## The built-in AI

Mimer can run its own AI **on this computer**, so you do not need LM Studio. Your notes never leave the computer. The built-in AI is what Mimer uses from the start. You can choose LM Studio instead under **Settings → AI → Mimer's provider**.

## Set it up

1. Open **Settings → AI** (or press **Set up** in the status bar).
2. Choose the **engine**. **Foundry Local** (Microsoft) picks the best hardware by itself, including a neural processor (NPU). The first time, it asks before anything is downloaded: **Download and find my hardware** fetches the hardware parts from Microsoft so the graphics card or neural processor can be used, **Use only the processor** downloads nothing and lists only models for the processor (you can press **Find my hardware** later). After that it lists every chat model it can run on this computer, with what each is good for, its size, where it runs, how much text it reads and its licence. Search and filter the list (writing, reasoning, code, models that can use tools, downloaded, hardware, size), or open **All Foundry Local models at Microsoft** and type the name of one you found there. A model without tools can fix, rewrite and answer about the open note, but cannot search the vault or run skills; it needs Windows 11 24H2 or later, or Linux, and is in every version. **Windows AI · Phi Silica** is only in the Microsoft Store version and only on a Copilot+ PC: it is built into Windows and runs on the neural processor, so there is nothing to download in Mimer. Its box **Phi Silica on this PC** shows what Windows says (access, this PC, the model); **Test Phi Silica** sends a short sentence, and **Use Phi Silica for my notes** makes Mimer use it. Phi Silica cannot call tools, so skills and vault search in the chat are not available with it, and long notes are shortened. **llama.cpp** works on many graphics cards with Google's Gemma models, but not in the Store version. You can download both and switch between them. For llama.cpp, choose your **processor** and your **graphics card**. Mimer pre-selects what it finds. The engine follows the graphics card: **Vulkan** works with AMD, Intel and Nvidia, **CUDA** is fastest on Nvidia, **CPU only** works everywhere but is slow.
3. Choose a **model**. **Gemma 4 12B** is the recommended one and needs about 12 GB of memory. **E4B** and **E2B** are lighter. You can also add your own `.gguf` file.
4. Press **Download**. This fetches two things, and nothing is downloaded before you press it: the **engine** (the open-source program llama.cpp, MIT licence) from github.com, and the **model** (Google Gemma 4, Apache-2.0) from huggingface.co. Together they are several GB, shown before you start, and they take about as much disk space. The files are checked after the download and kept in Mimer's own folder. If the connection breaks, press Download again: it continues where it stopped.

## Load and unload

**Load AI** loads the model into memory. It takes some seconds to a minute. The button is in the status bar and in the settings of the AI. You do not have to press it first: when you use an AI command or send a question while the AI is not loaded, Mimer loads it by itself. **Unload AI** (in the same two places) unloads the model and gives the memory back, so use it when you need the memory for something else. Closing Mimer, or a crash, also unloads it. In Settings you can choose that Mimer unloads it by itself after some idle minutes.

## When something goes wrong

A red box says what happened and what to do, step by step. If Foundry Local's engine crashes (the code `0xC0000005`, "access violation"), it is a fault inside Foundry Local or the hardware part it uses, and Mimer itself is not affected. Models for the neural processor (NPU) crash most, on some AMD computers: choose a model that runs on the graphics card (GPU) or the processor (CPU), and keep the drivers up to date, including the NPU driver. **Show details** has the engine's own last lines, and **Copy details** copies them. The most common causes are too little memory (lower the context size, use less of the graphics card, or choose a lighter model), an out-of-date graphics driver (update it, or choose CPU only), and security software blocking the engine.

## Settings

They apply the next time the AI is loaded. If it is loaded now, press **Unload AI** and then **Load AI**.

- **Context size**: how much text Mimer keeps in mind. More uses much more memory.
- **Use the graphics card**: automatic, as much as possible, not at all, or a number of layers.
- **Processor threads**, **Flash attention**, **Let the model think** (slower; off is best for notes), **Unload after**.

## Files

The engine and the models are in a folder called `mimer-ai`. On Windows it is next to the program, and **uninstalling Mimer removes it**. On Linux it is in your user data folder; **Remove files** in the settings deletes it. Settings → AI shows the exact folder and how much space it uses.
