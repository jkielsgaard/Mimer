# Parked idea: a meeting recorder in Mimer (speech to text)

Status: **parked** (not planned for now; kept here so it can be picked up again). Goal from the owner: record a meeting, get the words as text (Danish and English), no AI rewriting, then the person decides what to do with the text.

## The starting point

The idea: record a meeting on the computer and get the words as text, with no cloud service. Two audio streams are involved: the **microphone** (what you say) and the **system audio** (what the other people say in an online meeting). A person who dials in by phone and is not on the computer cannot be heard through system audio.

Mimer's rule is that notes and audio never leave the computer unless the person agrees. So the transcription must be **local**.

## What it takes

1. **Capture the audio.**
   - _Microphone_: from the web view (`getUserMedia`) or from Rust (the `cpal` crate). Needs the operating system's microphone permission.
   - _System audio_ (the other people): **Windows** has WASAPI loopback; `cpal` can record from an output device ([cpal](https://docs.rs/crate/cpal/latest/source/src/host/wasapi/mod.rs)), and there is a Tauri plugin for it ([tauri-plugin-system-audio](https://docs.rs/crate/tauri-plugin-system-audio/latest/source/src/loopback.rs)). It records everything one output device plays, not one app. **Linux** records the "monitor" of the default sink through PulseAudio or PipeWire. Both can be done, with different code on each system.
2. **Turn speech into text, locally.**
   - **Whisper** is the only realistic family that handles Danish and English. Sizes run from tiny (39 M parameters) to large (1.55 B); quantised model files are roughly 75 MB (tiny) to 2.9 GB (large), and large-v3 can be shrunk to about 550 MB with 5-bit quantisation (one commercial blog, to be checked against the whisper.cpp documentation: [OpenWhispr](https://openwhispr.com/blog/whisper-model-sizes-explained)).
   - **Danish quality is the main risk.** On the Danish CoRal test set, Whisper small makes errors in about 55 % of the words and large-v3 in about 28 %; a version of large-v3 fine-tuned on Danish speech reaches about 10–12 % ([Røst models](https://huggingface.co/CoRal-project/roest-v3-whisper-1.5b)). The numbers come from different test sets and are not strictly comparable, but they say: **a small model is poor in Danish, large-v3 is usable, and a Danish fine-tune is much better.** English is much better at every size.
   - **Ways to run it:**
     - _whisper.cpp_ (C++, runs on CPU, also Vulkan/GPU builds) with a Rust binding. Mimer already ships and manages one such engine (llama.cpp), so downloading a model on request is a known pattern.
     - _Foundry Local_ (Windows, already in Mimer) has an audio-transcription API with Whisper models, using the NPU, GPU or CPU ([Microsoft docs](https://learn.microsoft.com/en-au/Azure/foundry-local/how-to/how-to-transcribe-audio)). A report in its repository says larger Whisper variants returned empty text while `whisper-tiny` worked, so it must be tested before it is relied on. Mimer's model list today leaves speech models out.
   - **License of the Danish fine-tune** could not be confirmed here: check the model's page before shipping it. Nothing found says it exists as a ready whisper.cpp (GGML) file; it would be converted.
3. **Who spoke.** Two streams (you and the others) give "me" and "them" for free. Telling several other people apart (speaker diarization) needs another model and is a later step.
4. **Where the text goes.** Into the meeting's note, under its own heading, as plain lines with time marks. Nothing is rewritten. The person then uses the existing tools (notes under each agenda item, tasks, the AI commands) on it if they want to.

## How it could look in Mimer

- A **Record** button on the meeting screen and the meeting page; a clear "recording" mark and a stop button; the audio is kept as a file in the vault only if the person ticks that, otherwise it is deleted after the text is made.
- Transcription runs **after** (or in short pieces during) the meeting, on the computer; a progress line shows it.
- Settings → a new **Recording** section: the model (Small, Medium, Large, and "Danish" if the license allows), download on request, which microphone, whether to include the system audio, language (Danish, English, automatic).

## Rights and care

- Recording other people has legal and social rules (consent). Mimer should say so on first use and show a visible recording mark. This is for the owner to decide how strongly.
- A managed work computer may block system-audio capture or the microphone; that is a policy question, not something to work around.

## Options

1. **Microphone only, Whisper through whisper.cpp (recommended first step).** Works on both systems, simplest permissions, good for the person's own notes and for a laptop in a room (the others are picked up by the microphone, with lower quality). Large model for Danish.
2. **Microphone and system audio.** Two code paths (Windows loopback, Linux monitor) and permissions; clearly better quality for online meetings.
3. **Foundry Local for the transcription on Windows** and whisper.cpp elsewhere. Possible later, after testing its audio API.

## Recommendation

Do it in two steps: first microphone-only with a downloadable Whisper model (choose by hardware: Small for a quick test, Large for real use), written into the meeting note as plain lines; then add system audio, one system at a time. The Danish quality depends on the model, so the first thing to do is a **spike**: run Whisper large-v3 on a real Danish meeting recording on the owner's computer and read the result, before any design.

## Questions for the owner

- Is the owner ready to download a model of about 0.5–3 GB for good Danish?
- Online meetings (system audio) or meetings in a room (microphone) first?
- Should the audio file be kept, or only the text?
