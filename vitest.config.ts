import { VitestConfig, VitestProject } from "@savvy-web/vitest";

const compliance = VitestProject.custom("compliance", {
	name: "compliance",
	include: ["__test__/yaml-test-suite.test.ts"],
	overrides: {
		test: {
			testTimeout: 30_000,
		},
	},
});

export default VitestConfig.create(({ projects, coverage, reporters }) => ({
	test: {
		reporters,
		projects: [
			...projects.map((p) => {
				const config = p.toConfig();
				// Exclude compliance tests from auto-discovered projects
				if (config.test) {
					config.test.exclude = [...(config.test.exclude ?? []), "__test__/yaml-test-suite.test.ts"];
				}
				return config;
			}),
			compliance.toConfig(),
		],
		coverage: { provider: "v8", ...coverage },
	},
}));
