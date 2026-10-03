import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "halo-sql-studio",
		compatibilityDate: "2026-10-01",
		assets: {
			notFoundHandling: "single-page-application",
		},
	},
});
