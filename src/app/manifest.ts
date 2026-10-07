import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MBP Catering",
    short_name: "MBP Catering",
    description: "Catering professionnel et événementiel à Bruxelles et dans les environs.",
    start_url: "/fr",
    display: "standalone",
    background_color: "#fffcf4",
    theme_color: "#718a42",
  };
}
