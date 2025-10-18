import { FFmpeg, fetchFile } from "./ffmpeg/client.js";

/** @satisfies {Record<string, HTMLInputElement>} */
const inputs = {
	files: document.getElementById("files"),
	artwork: document.getElementById("artwork"),
	sampleRate: document.getElementById("sampleRate"),
	bitRate: document.getElementById("bitRate"),
	bitDepth: document.getElementById("bitDepth"),
	legacyDevice: document.getElementById("legacyDevice"),
	codec: document.getElementById("codec"),
};

/** @satisfies {Record<string, HTMLElement>} */
const elements = {
	output: document.getElementById("output"),
	debug: document.getElementById("debug"),
	cover: document.getElementById("cover"),
	download: document.getElementById("download"),
	run: document.getElementById("run"),
	progress: document.getElementById("progress"),
	advanced: document.getElementById("advanced"),
};

/** @type {import("@ffmpeg/ffmpeg").FFmpeg} */
const ffmpeg = new FFmpeg();

async function register() {
	try {
		await navigator.serviceWorker.register("service-worker.js", { scope: "/" });
	} catch (error) {
		console.error("service worker", error);
	}
}

async function main() {
	try {
		if ("serviceWorker" in navigator) register();

		globalThis.addEventListener("unhandledrejection", (event) => {
			console.error(event);
			output("ERROR: " + event.reason);
		});

		// Persist the "advanced" details open/closed state
		// NOTE: could be a nice custom element
		elements.advanced.open = Boolean(localStorage.getItem("advanced"));
		elements.advanced.addEventListener("toggle", () => {
			if (elements.advanced.open) localStorage.setItem("advanced", "true");
			else localStorage.removeItem("advanced");
		});

		ffmpeg.on("log", (event) => {
			console.debug("@ffmpeg", event);
		});

		ffmpeg.on("progress", (event) => {
			console.debug("@progress", event.progress);

			if (elements.progress.hasAttribute("disabled")) return;

			if (event.progress < 0) {
				elements.progress.removeAttribute("value");
			} else {
				elements.progress.value = Math.round(event.progress * 1000);
			}
		});

		await ffmpeg.load({
			coreURL: "/ffmpeg/core.js",
			wasmURL: "/ffmpeg/core.wasm",
		});

		if (inputs.files.files) onFiles(Array.from(inputs.files.files));
		inputs.files.oninput = () => onFiles(Array.from(inputs.files.files));

		elements.run.onclick = onRun;

		//
	} catch (error) {
		console.error(error);
		output("ERROR: " + error);
	}
}

const metadata = {
	cover: null,
	artist: "",
	composer: "",
	album: "",
	date: "",
};

/** @param {File[]} files */
async function onFiles(files) {
	console.debug("files", files);

	if (files.length === 0) {
		elements.run.setAttribute("disabled", "");
	} else {
		elements.run.removeAttribute("disabled");
	}

	metadata.cover = null;

	for (const file of files) {
		const ok = await ffmpeg.writeFile(file.name, await fetchFile(file));
		if (!ok) throw new Error("Failed to open file " + file.name);
		debug("add " + file.name);

		const info = await getInfo(file.name);

		if (!metadata.album) metadata.album = info.format.tags.album;
		if (!metadata.artist) metadata.artist = info.format.tags.artist;
		if (!metadata.composer) metadata.composer = info.format.tags.composer;
		if (!metadata.date) metadata.date = info.format.tags.date;
		if (!metadata.cover) metadata.cover = await getCover(file.name);

		debug(JSON.stringify(info));
		debug("---");

		// https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/FFmpeg#ffprobe
	}

	if (elements.cover.src) {
		URL.revokeObjectURL(elements.cover.src);
	}
	if (metadata.cover) {
		elements.cover.src = URL.createObjectURL(metadata.cover);
		elements.cover.alt = metadata.album;
	}

	debug(JSON.stringify(metadata, null, 2));
}

async function onRun() {
	globalThis?.Notification?.requestPermission();

	if (elements.download.href) {
		URL.revokeObjectURL(elements.download.href);
	}
	elements.download.href = "#";
	elements.download.setAttribute("disabled", "");

	const files = Array.from(inputs.files.files);
	const cover = elements.cover.src;

	elements.progress.value = 0;
	elements.progress.removeAttribute("disabled");

	const data = await generate(files, cover, metadata).catch((error) => {
		console.error(error);
		output("ERROR: " + error);
		return null;
	});

	elements.progress.setAttribute("disabled", "");

	if (data) {
		elements.download.removeAttribute("disabled");
		elements.download.href = URL.createObjectURL(data);
		elements.download.download = data.name;

		if (globalThis?.Notification?.permission === "granted") {
			const n = new Notification("Audiobook finished", {
				body: "Generating audiobook has completed",
				icon: "/icon.png",
			});

			// The tab has become visible so clear the now-stale Notification.
			n.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") n.close();
			});
		}
	}
}

/** @param {string} filename */
async function getInfo(filename) {
	const result = await ffmpeg.ffprobe([
		filename,
		"-loglevel",
		"error",
		"-show_streams",
		"-show_entries",
		"stream_tags:format_tags",
		"-of",
		"json",
		"-o",
		"output.json",
	]);

	console.debug("probe", filename, result);

	const data = await ffmpeg.readFile("output.json", "utf8");
	await ffmpeg.deleteFile("output.json");
	return JSON.parse(data);
}

/** @param {string} filename */
async function getCover(filename) {
	const result = await ffmpeg.exec([
		"-i",
		filename,
		"-an",
		"-vcodec",
		"copy",
		"cover.jpg",
		"-loglevel",
		"error",
	]);

	debug("cover " + (result == 0 ? "found" : "miss"));
	if (result !== 0) return null;

	const data = await ffmpeg.readFile("cover.jpg");
	await ffmpeg.deleteFile("cover.jpg");
	return new File([data], "cover.jpg");
}

function output(text) {
	elements.output.innerHTML += text + "\n";
}

function debug(text) {
	elements.debug.innerHTML += text + "\n";
}

/**
 * @param {File[]} files
 * @param {string} cover
 */
async function generate(files, cover, info = {}) {
	output("Fetching info…");

	const entries = [];

	// Go through each file and fetch it's metadata
	for (const file of files) {
		entries.push({
			...(await getInfo(file.name)),
			name: file.name,
			lastModified: file.lastModified,
		});
	}

	// Sort files by name
	// TODO: it could use track number from the tags?
	entries.sort((a, b) => a.name.localeCompare(b.name));

	// Generate the list.txt to concat the files together
	const list = entries.map((f) => `file '${cleanName(f.name)}'`).join("\n");
	await ffmpeg.writeFile("list.txt", list);

	debug("--- list");
	debug(list);

	// Generate the final metadata
	const metadata = [`;FFMETADATA1`];
	if (info.album) metadata.push(`title=${info.album}`);
	if (info.album) metadata.push(`album=${info.album}`);
	if (info.artist) metadata.push(`artist=${info.artist}`);
	if (info.composer) metadata.push(`composer=${info.composer}`);
	metadata.push("\n");

	// Add chapters to the metadata from the individual files
	let time = 0;
	for (const file of entries) {
		const chapter = getChapter(file, time);
		time = chapter.end;
		metadata.push(chapter.text, "\n");
	}

	await ffmpeg.writeFile("metadata.ini", metadata.join("\n"));

	debug("--- metadata");
	debug(metadata.join("\n"));
	debug("---");

	if (cover) await ffmpeg.writeFile("cover.jpg", await fetchFile(cover));

	// Concatenate all the audio files together and convert to AAC
	output("Combining…");
	const combine = ["-f", "concat", "-safe", "0", "-i", "list.txt"];

	if (inputs.codec?.value) {
		combine.push("-codec:a", inputs.codec.value);
	}
	if (inputs.sampleRate?.value) {
		combine.push("-ar", inputs.sampleRate.value);
	}
	if (inputs.bitRate?.value) {
		combine.push("-b:a", inputs.bitRate.value + "k");
	}
	if (inputs.bitDepth?.value) {
		combine.push("-sample_fmt", "s" + inputs.bitDepth.value);
	}
	if (inputs.legacyDevice?.checked) {
		combine.push("-aac_pns", "0");
	}
	combine.push("all.m4a");
	debug("> ffmpeg " + combine.join(" "));
	await ffmpeg.exec(combine);

	// Combine the audio, cover & metadata together into a single m4b file
	output("configuring…");
	const configure = [
		"-i",
		"all.m4a",
		"-i",
		"cover.jpg",
		"-i",
		"metadata.ini",
		"-map",
		"0:a",
		"-map",
		"1",
		"-c",
		"copy",
		"-disposition:1",
		"attached_pic",
		"-map_metadata",
		"2",
		"output.m4b",
	];
	debug("> ffmpeg " + configure.join(" "));
	await ffmpeg.exec(configure);

	const file = await ffmpeg.readFile("output.m4b");

	// Clean up the virtual filesystem
	await ffmpeg.deleteFile("cover.jpg");
	await ffmpeg.deleteFile("list.txt");
	await ffmpeg.deleteFile("metadata.ini");
	await ffmpeg.deleteFile("output.m4b");

	return new File([file], `${info.album ?? "output"}.m4b`);
}

function getChapter(info, start = 0) {
	const stream = info.streams.find((s) => s.codec_type === "audio");
	const duration = Math.round(parseFloat(stream.duration) * 1000);

	const text = [
		"[CHAPTER]",
		`TIMEBASE=1/1000`,
		`START=${start}`,
		`END=${start + duration}`,
		`TITLE=${info.format.tags.title}`,
	].join("\n");

	return {
		text,
		end: start + duration,
	};
}

function cleanName(filename) {
	return filename.replace(/'/g, "\\'");
}

main();
