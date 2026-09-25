import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // klend-sdk pulls native/WASM bindings (orca whirlpools, bigint) that must NOT be bundled —
  // keep them external so they load from node_modules with their .wasm/.node assets intact.
  experimental: {
    serverComponentsExternalPackages: [
      "@kamino-finance/klend-sdk",
      "@kamino-finance/farms-sdk",
      "@orca-so/whirlpools-core",
      "@coral-xyz/anchor",
    ],
  },
  // klend-sdk + wallet-adapter pull node/browser polyfilled deps; keep them external on server
  // and let webpack resolve the browser fallbacks on the client.
  webpack: (config, { isServer }) => {
    // DEV-005: klend-sdk 7.3.22 imports a farms-sdk submodule path that the installed
    // farms-sdk (3.2.26) renamed. Alias the stale specifier to our shim.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@kamino-finance/farms-sdk/dist/@codegen/farms/programId": path.resolve(
        __dirname,
        "src/lib/server/farms-programId-shim.js"
      ),
    };
    if (isServer) {
      // Keep the SDKs (and their .wasm/.node native assets) OUT of the webpack bundle so they
      // load from node_modules at runtime with their bindings intact. Bundling them breaks the
      // orca whirlpools WASM (readFileSync of a .wasm that never gets copied).
      const externalPkgs = [
        "@kamino-finance/klend-sdk",
        "@kamino-finance/farms-sdk",
        "@kamino-finance/kliquidity-sdk",
        "@orca-so/whirlpools-core",
        "@coral-xyz/anchor",
      ];
      const prev = config.externals || [];
      config.externals = [
        ...(Array.isArray(prev) ? prev : [prev]),
        ({ request }, cb) => {
          if (
            request &&
            externalPkgs.some(
              (p) => request === p || request.startsWith(p + "/")
            )
          ) {
            return cb(null, "commonjs " + request);
          }
          cb();
        },
      ];
    }
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
