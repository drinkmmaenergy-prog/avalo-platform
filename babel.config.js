module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: [
            '.ios.js',
            '.android.js',
            '.js',
            '.ts',
            '.tsx',
            '.json',
          ],
          alias: {
            '@': './app-mobile',
            '@avalo/shared': '../shared/src',
            '@avalo/sdk': '../sdk/src',
          },
        },
      ],
      // Reanimated must be last
      'react-native-reanimated/plugin',
    ],
  };
};
