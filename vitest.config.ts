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

const complianceRaw = VitestProject.custom("compliance-raw", {
	name: "compliance-raw",
	include: ["__test__/yaml-test-suite-raw.test.ts"],
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
					config.test.exclude = [
						...(config.test.exclude ?? []),
						"__test__/yaml-test-suite.test.ts",
						"__test__/yaml-test-suite-raw.test.ts",
					];
				}
				return config;
			}),
			compliance.toConfig(),
			complianceRaw.toConfig(),
		],
		coverage: { provider: "v8", ...coverage },
	},
}));
