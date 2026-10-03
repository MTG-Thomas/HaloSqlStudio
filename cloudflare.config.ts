import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "halo-sql-studio",
		compatibilityDate: "2026-10-01",
		domains: ["sql.midtowntg.com"],
		assets: {
			notFoundHandling: "single-page-application",
		},
	},
});
