module.exports = function configureBabel(api) {
  api.cache(true);

  return {
    plugins: ["expo-router/babel", "nativewind/babel"],
    presets: ["babel-preset-expo"],
  };
};
