import { startServer } from "../../dist/index.js";
// import { createAuth, fastifyAdapter } from "@oneunit/auth";
// npm install @oneunit/auth --save

// const auth = createAuth({
//   secret: process.env.AUTH_SECRET ?? "change-me-in-production",
//   rbac: {
//     roles: {
//       user: { permissions: ["me.read", "posts.read"] },
//       admin: { permissions: ["*"], inherits: ["user"] },
//     },
//   },
// });

const { address } = await startServer(8080, {
  serviceName: "auth-demo",
  logger: false,
  plugins: {
    cors: { origin: true, credentials: true },
    helmet: { contentSecurityPolicy: false },
    cookie: { secret: "change-me" },
    compress: true,
    rateLimit: { max: 100, timeWindow: "1 minute" },
    zod: true,
  },
  extraPlugins: [
    // async (server) => {
    //   // Register the auth adapter
    //   await server.register(fastifyAdapter(auth));

    //   // Public login endpoint
    //   server.post("/auth/login", {
    //     schema: {
    //       body: {
    //         type: "object",
    //         required: ["id"],
    //         properties: {
    //           id: { type: "string" },
    //           email: { type: "string", format: "email" },
    //           roles: { type: "array", items: { type: "string" } },
    //         },
    //       },
    //     },
    //   }, async (request) => {
    //     const { id, email, roles = ["user"] } = request.body as {
    //       id: string;
    //       email?: string;
    //       roles?: string[];
    //     };
    //     return auth.login({ id, email, roles });
    //   });

    //   // Protected route
    //   server.get("/me", {
    //     preHandler: [server.authenticate()],
    //     schema: {
    //       response: {
    //         200: {
    //           type: "object",
    //           properties: {
    //             id: { type: "string" },
    //             email: { type: "string" },
    //             roles: { type: "array", items: { type: "string" } },
    //           },
    //         },
    //       },
    //     },
    //   }, async (request) => {
    //     return request.user;
    //   });

    //   // Admin-only route
    //   server.get("/admin", {
    //     preHandler: [server.authenticate(), server.requirePermission("posts.delete")],
    //   }, async () => {
    //     return { message: "Admin access granted" };
    //   });
    // },
  ],
});

console.log(`auth example listening at ${address}`);
// 
// To use auth with server package:
// 1. npm install @oneunit/auth
// 2. Uncomment the auth code above
// 3. Set AUTH_SECRET environment variable