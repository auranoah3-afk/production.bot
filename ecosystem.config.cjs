module.exports = {
  apps: [
    {
      name: "discordbot",
      script: "src/index.js",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
