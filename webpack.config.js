const path = require('path');

module.exports = {
  entry: {
      bundle: './src/main/index.ts',
      taskthemwebworker:'./src/web-workers/task-scheduler-ww.ts'
  },
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js' ],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  }
};