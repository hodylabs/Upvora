/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
// The new UI ("ui2"): a second bundle with its own entry, styles and output folder.
// It reuses the classic config's loaders and aliases (services, models, locales) but
// none of classic's components or stylesheets. Output goes to dist/ui2, served at
// /assets/ui2/, with its own assets.json that the Go renderer reads.
const path = require("path")
const glob = require("glob")
const { PurgeCSSPlugin } = require("purgecss-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin
const classic = require("./webpack.config.js")

const isProduction = process.env.NODE_ENV === "production"

const plugins = [
  new MiniCssExtractPlugin({
    filename: "css/[name].[contenthash].css",
    chunkFilename: "css/[name].[contenthash].css",
  }),
  new BundleAnalyzerPlugin({
    analyzerMode: "disabled",
    generateStatsFile: true,
    statsFilename: "assets.json",
    statsOptions: { assets: false, children: false, chunks: false, entrypoints: true, chunkGroups: true, modules: false },
  }),
]

if (isProduction) {
  plugins.push(
    new PurgeCSSPlugin({
      paths: [...glob.sync(`./public/ui2/**/*.{ts,tsx}`, { nodir: true })],
      defaultExtractor: (content) => content.match(/[^<>"'`\s]*[^<>"'`\s:]/g) || [],
      // body/html carry the tokens (body.u2, set from script) and never appear as text in the sources
      safelist: { standard: ["body", "html", /--/, /__/, /data-/, /^is-/] },
    })
  )
}

module.exports = {
  ...classic,
  entry: {
    main: "./public/ui2/index.tsx",
  },
  output: {
    path: path.resolve(__dirname, "dist/ui2"),
    filename: "js/[name].[contenthash].js",
    publicPath: "/assets/ui2/",
    clean: true,
  },
  optimization: {
    moduleIds: "deterministic",
    runtimeChunk: "single",
    splitChunks: {
      cacheGroups: {
        shared: {
          chunks: "all",
          name: "shared",
          test: /[\\/]public[\\/](services|models|hooks)[\\/]/,
        },
        vendor: {
          chunks: "all",
          name: "vendor",
          test: /(react($|\/)|react-dom|tslib|@lingui\/core)/,
        },
      },
    },
  },
  plugins,
}
