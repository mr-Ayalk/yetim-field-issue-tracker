import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

process.env.DATABASE_URL ??= "postgresql://yetim:yetim@127.0.0.1:5432/yetim";
process.env.YETIM_DEMO_MODE ??= "true";
