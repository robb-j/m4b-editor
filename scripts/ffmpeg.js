#!/usr/bin/env node

//
// A script to prepare the @ffmpeg NPM library for the web app
// Only needs to be ran if the ffmpeg dependency changes
//
// Usage: node ./hack/ffmpeg.js
//

import fs from "node:fs/promises";
import process from "node:process";
import esbuild from "esbuild";

// 1. ensure the directory exists
await fs.mkdir("source/ffmpeg", { recursive: true });

// 2. Copy in the compiled core library and wasm
await fs.cp(
	"node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js",
	"source/ffmpeg/core.js"
);
await fs.cp(
	"node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm",
	"source/ffmpeg/core.wasm"
);

// 3. Bundle the ffmpeg client and utilities into a single file
await esbuild.build({
	stdin: {
		resolveDir: process.cwd(),
		contents: `
			export * from "@ffmpeg/ffmpeg";
			export * from "@ffmpeg/util";
		`,
	},
	bundle: true,
	format: "esm",
	outfile: "source/ffmpeg/client.js",
});

// Bundle the ffmpeg worker into a single file
await esbuild.build({
	stdin: {
		resolveDir: process.cwd(),
		contents: `
			export * from "@ffmpeg/ffmpeg/worker";
		`,
	},
	bundle: true,
	format: "esm",
	outfile: "source/ffmpeg/worker.js",
});
