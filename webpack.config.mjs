import path from 'path';

const __dirname = '.';

export default {
  mode: 'production',
  devtool: "source-map",
  entry: path.resolve(__dirname, './js/index.mjs'),
  experiments: {
    topLevelAwait: true
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        use: [path.resolve(__dirname, './js/binary-loader.js')],
      },{
        test: /\.mjs$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      }
    ],
  },
  output: {
    path: path.resolve(__dirname, './www/dist/'),
    filename: 'webbdplayer.js',
  },
};
