console.log("...");

export class Converter {
	/** @type {import("@ffmpeg/ffmpeg").FFmpeg} */
	ffmpeg;

	constructor(ffmpeg) {
		this.ffmpeg = ffmpeg;
	}

	/** @param {string} filename */
	async getInfo(filename) {
		const result = await this.ffmpeg.ffprobe([
			filename,
			"-loglevel",
			"error",
			"-show_entries",
			"stream_tags:format_tags",
			"-of",
			"json",
			"-o",
			"output.json",
		]);

		console.debug("probe", filename, result);

		const data = await this.ffmpeg.readFile("output.json", "utf8");
		await this.ffmpeg.deleteFile("output.json");
		return JSON.parse(data);
	}

	/** @param {string} filename */
	async getCover(filename) {
		const result = await ffmpeg.exec([
			"-i",
			filename,
			"-an",
			"-vcodec",
			"copy",
			"output.jpg",
			"-loglevel",
			"error",
		]);

		console.debug("cover", filename, result);
		if (result !== 0) return null;

		const data = await ffmpeg.readFile("output.jpg");
		await ffmpeg.deleteFile("output.jpg");
		return new File([data], filename);
	}

	/**
	 * @param {File[]} files
	 * @param {File} cover
	 */
	async generate(files, cover) {}
}
// ffmpeg -i output.m4a -i cover.jpg -i metadata.ini -map 0:a -map 1 -c copy -disposition:1 attached_pic -map_metadata 2 output.m4b

// ffmpeg -i output.m4a -i cover.jpg -i metadata.txt -map 0:a -map 1 -c copy -disposition:1 attached_pic -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -map_metadata 2 output.m4b

// ffmpeg -i input.mp3 -i cover.jpg -c copy -map 0 -map 1 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" output.mp3
// ffmpeg -i input.mp3 -i cover.png -c copy -map 0 -map 1 -metadata:s:v title="Album cover" output.mp3
// ffmpeg -i input.mp4 -i chaps.txt -map_metadata 1 -c copy output.mp4
