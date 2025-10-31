import antfu from "@antfu/eslint-config"

export default antfu(
	{
		stylistic: {
			indent: "tab",
			quotes: "double",
		},
		ignores: ["build", "node_modules"],
		extends: ["plugin:perfectionist/recommended-natural"],
	},
	{
		rules: {
			"no-console": "off",
		},
	},
)
