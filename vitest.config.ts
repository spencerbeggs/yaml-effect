import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create({
	coverage: VitestConfig.COVERAGE_LEVELS.strict,
	coverageTargets: VitestConfig.COVERAGE_LEVELS.strict,
	e2e: {
		testTimeout: 30_000,
	},
});
