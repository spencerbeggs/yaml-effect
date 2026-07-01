import { build } from "@savvy-web/bundler";

await build({
	meta: {
		tsdoc: {
			// Effect's Context.Tag generates synthetic `_base` intermediate classes
			// that cannot be exported or release-tagged from source. This is the
			// toolchain-sanctioned suppression for this pattern.
			suppressWarnings: [
				{ messageId: "ae-forgotten-export", pattern: "_base" },
				// The `*ErrorBase` classes are exported @internal on purpose: Data.TaggedError
				// produces intersection types api-extractor cannot roll up, so the @public
				// concrete error class extends an @internal base. Documented in errors.md.
				{ messageId: "ae-incompatible-release-tags", pattern: "ErrorBase" },
			],
		},
	},
});
