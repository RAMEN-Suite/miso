# Installation

1. If you are using Windows, make sure [Windows Subsystem for Linux](https://learn.microsoft.com/de-de/windows/wsl/install) (WSL), [Docker Desktop](https://www.docker.com/) and [Node.js](https://nodejs.org/en/download/package-manager) (in WSL) are installed.

2. Open a command line tool (e.g. Ubuntu), select a directory, clone the repo and move into it.

   ```sh
   cd <your-directory-name>
   git clone https://github.com/RAMEN-Suite/miso.git
   cd miso
   ```

3. Copy the `.env.example` file to create your `.env` file.

   ```sh
   cp .env.example .env
   ```

   Its values fit the local compose setup; change the URLs (favicon, Tori, Shoyu) if you need them.

4. Install the dependencies on your machine and set up the commit hook once (the repository uses Conventional
   Commits, see CONTRIBUTING.md). The containers install their own dependencies; the local ones are for your editor
   (types, ESLint, Prettier).

   ```sh
   nvm install && npm ci && npm run prepare
   (cd server && npm ci)
   (cd client && npm ci)
   ```

5. Build the development images and run the app. Compose installs the dependencies inside the images and syncs your
   changes into the running containers.

   ```
   docker compose up --build --watch
   ```

   **Please be patient, Neo4j takes its time. Wait approx. 1 minute**.

   Neo4j runs the 5.26 LTS release, as on the servers. Data and plugins from the earlier 2026.x image can't be opened by
   5.26: before the first start, delete `./neo4j/data` and `./neo4j/plugins` (export anything you still need first).

You can now access the editor and the database:

- Editor start page: http://localhost:5173
- Neo4j database: http://localhost:7474
