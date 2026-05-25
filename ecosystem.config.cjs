module.exports = {
  apps: [
    {
      name: "discordbot",
      script: "src/index.js",
      watch: false,
      ignore_watch: ['node_modules', '.git', 'data'],
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 30000,
      shutdown_with_message: true,
      env: {
        NODE_ENV: "production"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "discordbot-dev",
      script: "src/index.js",
      watch: false,
      ignore_watch: ['node_modules', '.git', 'data'],
      autorestart: false,
      restart_delay: 5000,
      kill_timeout: 30000,
      shutdown_with_message: true,
      env: {
        NODE_ENV: "development",
        BOT_ENV: "development",
        DEV_BOT_AUTO_SHUTDOWN: "true"
      },
      env_development: {
        NODE_ENV: "development",
        BOT_ENV: "development",
        DEV_BOT_AUTO_SHUTDOWN: "true"
      }
    }
  ]
};
