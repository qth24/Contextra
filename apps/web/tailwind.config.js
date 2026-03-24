export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                ink: "#0f172a",
                mist: "#e0f2fe",
                surf: "#dbeafe",
                tide: "#2563eb",
                harbor: "#0f4c81"
            },
            boxShadow: {
                card: "0 24px 60px rgba(15, 23, 42, 0.08)"
            },
            fontFamily: {
                sans: ["Manrope", "sans-serif"],
                display: ["Space Grotesk", "sans-serif"]
            }
        }
    },
    plugins: []
};
