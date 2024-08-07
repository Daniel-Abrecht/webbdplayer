import path from 'path';

const __dirname = '.';

export default {
  mode: 'development',
  devtool: "source-map",
  entry: path.resolve(__dirname, './js/index.mjs'),
  experiments: {
    topLevelAwait: true
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            /*assumptions: {
              "privateFieldsAsProperties": true,
              "setPublicClassFields": true
            },*/
            plugins: [
              "@babel/plugin-transform-private-methods",
              "@babel/plugin-transform-private-property-in-object",
              "@babel/plugin-transform-logical-assignment-operators",
              "@babel/plugin-transform-nullish-coalescing-operator",
              "@babel/plugin-transform-optional-chaining",
            ]
          }
        }
      },{
        test: /\.wasm$/,
        use: [path.resolve(__dirname, './js/binary-loader.js')],
      }
    ],
  },
  output: {
    path: path.resolve(__dirname, './www/dist/'),
    filename: 'webbdplayer.js',
  },
};
