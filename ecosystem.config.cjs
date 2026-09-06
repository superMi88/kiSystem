module.exports = {
  apps: [
    {
      name: "kisystem",
      script: "./build/index.js",
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
