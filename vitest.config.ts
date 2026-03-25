import { VitestConfig } from "@savvy-web/vitest";

// const compliance = VitestProject.custom("compliance", {
// 	name: "compliance",
// 	include: ["__test__/yaml-test-suite.test.ts"],
// 	overrides: {
// 		test: {
// 			testTimeout: 30_000,
// 		},
// 	},
// });

// const complianceRaw = VitestProject.custom("compliance-raw", {
// 	name: "compliance-raw",
// 	include: ["__test__/yaml-test-suite-raw.test.ts"],
// 	overrides: {
// 		test: {
// 			testTimeout: 30_000,
// 		},
// 	},
// });

export default VitestConfig.create();
