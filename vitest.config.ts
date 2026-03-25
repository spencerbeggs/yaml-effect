import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create({
	e2e: {
		testTimeout: 30_000,
	},
});
