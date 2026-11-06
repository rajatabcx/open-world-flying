export type Model = {
  name: string;
  author: string;
  license: "CC0" | "CC BY 3.0";
  sizeKb: number;
  id: string;
  file: string;
};

export type Category = { title: string; note: string; models: Model[] };

const cdn = (uuid: string) => `https://static.poly.pizza/${uuid}.glb`;

// Loaded live from Poly Pizza for previewing. Nothing is stored in the repo yet.
export const categories: Category[] = [
  {
    title: "Homes",
    note: "I found no free Mediterranean set, so these are the closest.",
    models: [
      { name: "SeaSide Villa", author: "Yogoshimo 2.0", license: "CC BY 3.0", sizeKb: 345, id: "03rq-iA54uU", file: cdn("5a127250-a11c-44c2-8ca9-ad0434b45ed4") },
      { name: "Villa", author: "Steren Giannini", license: "CC BY 3.0", sizeKb: 34, id: "1ogbmmlgzjv", file: cdn("7c3f8388-7d20-45ac-bdfd-b21b6c057a11") },
      { name: "Village House", author: "Ian MacGillivray", license: "CC BY 3.0", sizeKb: 385, id: "0JMckVadtWb", file: cdn("6349ef67-31a6-4848-a7a5-0f674d8df9d1") },
      { name: "Cottage", author: "CreativeTrio", license: "CC0", sizeKb: 177, id: "YDGLLT0emC", file: cdn("8ab3d7cd-dcce-4535-8c64-a22aa0487050") },
      { name: "Town House", author: "Quaternius", license: "CC0", sizeKb: 1893, id: "imVkxz7oZD", file: cdn("8467654d-d4e7-460e-9484-969bd122a40a") },
      { name: "Large Town House", author: "Quaternius", license: "CC0", sizeKb: 616, id: "Sl3ZTrWRwn", file: cdn("cf011371-80fa-4e00-b96c-581dbb63215b") },
    ],
  },
  {
    title: "Trees",
    note: "Tall cypress trees would set the Mediterranean mood.",
    models: [
      { name: "Cypress Tree", author: "Poly by Google", license: "CC BY 3.0", sizeKb: 1137, id: "eUQDPAFMQfv", file: cdn("69991e0b-aa2c-47ff-a9bc-80c135f67e0a") },
      { name: "Cypress Tree", author: "Andrea Zvinakis", license: "CC BY 3.0", sizeKb: 15, id: "4PHDVmmfFj9", file: cdn("69cf1a72-195d-459c-9f05-5eb25c54955e") },
      { name: "Pine", author: "Quaternius", license: "CC0", sizeKb: 2168, id: "Zt62gceKXZ", file: cdn("be462d46-2e48-401e-8da9-2f4d9bc9df0c") },
    ],
  },
  {
    title: "Hot air balloons",
    note: "These are what players will bounce off.",
    models: [
      { name: "Hot Air Balloon", author: "Poly by Google", license: "CC BY 3.0", sizeKb: 77, id: "7Fej0Jd3_Di", file: cdn("776312e5-40ed-40bf-9d26-5fe5ee4e5ce8") },
      { name: "Hot Air Balloon", author: "jeremy", license: "CC BY 3.0", sizeKb: 93, id: "ascrGCCFjFx", file: cdn("5c5de976-dedb-4bd5-a5e6-0d1138cd7d3c") },
    ],
  },
  {
    title: "Birds",
    note: "Flying alongside the player. None of these are confirmed to flap yet.",
    models: [
      { name: "Bird", author: "Quaternius", license: "CC0", sizeKb: 47, id: "gYYC0gYMnw", file: cdn("bc6de37a-fdc5-4ef2-85c6-4a2e7b5db9d5") },
      { name: "Flying Gull", author: "Poly by Google", license: "CC BY 3.0", sizeKb: 63, id: "eMNhHDZakYp", file: cdn("882c4ff3-c97b-4ae2-aedf-953c8d692898") },
      { name: "Seagull", author: "Poly by Google", license: "CC BY 3.0", sizeKb: 26, id: "0WRzrtCIIRp", file: cdn("76d4eea2-3700-43ae-b65c-7f6ea2dc5d23") },
    ],
  },
  {
    title: "Clouds",
    note: "Solid models. Soft, fluffy clouds would be made in code instead.",
    models: [
      { name: "Cloud", author: "Quaternius", license: "CC0", sizeKb: 27, id: "KdFNOVn1Gf", file: cdn("d9268957-7e64-408f-8bb7-14125af33081") },
      { name: "Low Poly Cloud", author: "Louto", license: "CC BY 3.0", sizeKb: 12, id: "bgitHe5MZE", file: cdn("886e19d2-2ba7-45c3-8d68-64b1171af5f9") },
      { name: "Clouds", author: "Jarlan Perez", license: "CC BY 3.0", sizeKb: 197, id: "b3Kia9N2fS2", file: cdn("b3fe94dc-472a-4a77-b190-9ffcb85cf171") },
    ],
  },
];
