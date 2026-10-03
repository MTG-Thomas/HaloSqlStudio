import { afterEach, describe, expect, it, vi } from "vitest";
import { installWebAnalytics } from "../src/lib/analytics";

interface FakeScript {
    id: string;
    defer: boolean;
    src: string;
    attributes: Record<string, string>;
    setAttribute: (name: string, value: string) => void;
}

function makeDocument() {
    const scripts: FakeScript[] = [];
    return {
        scripts,
        getElementById: (id: string) =>
            scripts.find((s) => s.id === id) ?? null,
        createElement: (tag: string) => {
            if (tag !== "script") throw new Error(`unexpected ${tag}`);
            const script: FakeScript = {
                id: "",
                defer: false,
                src: "",
                attributes: {},
                setAttribute(name: string, value: string) {
                    script.attributes[name] = value;
                },
            };
            return script;
        },
        body: {
            appendChild: (script: FakeScript) => {
                scripts.push(script);
            },
        },
    };
}

describe("installWebAnalytics", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("injects the configured beacon script once", () => {
        const fake = makeDocument();
        vi.stubGlobal("document", fake);

        installWebAnalytics();
        installWebAnalytics();

        expect(fake.scripts).toHaveLength(1);
        const [script] = fake.scripts;
        expect(script.src).toBe(
            "https://static.cloudflareinsights.com/beacon.min.js"
        );
        expect(script.defer).toBe(true);
        expect(JSON.parse(script.attributes["data-cf-beacon"])).toEqual({
            token: "d1f883f1db5b4c88aa736d010a3ae0d8",
        });
    });

    it("does nothing when a beacon is already present", () => {
        const fake = makeDocument();
        fake.scripts.push({
            id: "cf-web-analytics-beacon",
            defer: true,
            src: "existing",
            attributes: {},
            setAttribute: () => {},
        });
        vi.stubGlobal("document", fake);

        installWebAnalytics();

        expect(fake.scripts).toHaveLength(1);
        expect(fake.scripts[0].src).toBe("existing");
    });
});
