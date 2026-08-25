// TODO: connect Kimi search backend — replace dummy pickTurn/similar with real API.
// Copied verbatim from /chat/index.html's PRODUCTS/EXAMPLES/REFINES + helper fns.

export interface Product {
  brand: string
  name: string
  price: number
  /** 할인 전 정가 — 있으면 PDP 에서 취소선 표기 (실데이터 original_price 매핑 자리) */
  originalPrice?: number
  img: string
  url: string
}

export const PRODUCTS: Product[] = [
  { brand: "HALFBOY", name: "ALICE CARDIGAN", price: 323700, originalPrice: 359000, img: "https://cdn.shopify.com/s/files/1/0587/9588/4710/files/alice-cardigan-knit-cardigan-7157376.jpg?v=1753967537", url: "https://halfboy.com/products/alice-cardigan-hs251wk137yc004002" },
  { brand: "NAHMIAS", name: "Boat Tours Boxy Tee", price: 350350, originalPrice: 385000, img: "https://kith.com/cdn/shop/files/Y10-T23N14-100-FRONT_a87334c1-0f9f-47a3-9b65-d6528954e5af.jpg?v=1776115386&width=800", url: "https://kith.com/products/y10-t23n14-100" },
  { brand: "YUJI", name: "Vent Back Denim Blouse", price: 258000, img: "https://yujiofficial.kr/web/product/big/202603/e2c7f9b98d013e44a0c66e08003621b7.jpg", url: "https://yujiofficial.kr/product/detail.html?product_no=653" },
  { brand: "2000archives", name: "Arc Racing Jacket", price: 318890, img: "https://en.2000archives.com/web/product/medium/202503/bfb6d65550ef7202a823a290b91842a4.jpg", url: "https://en.2000archives.com/product/unisex-arc-racing-jacket-beige/1005/category/42/display/1/" },
  { brand: "Polysooem", name: "Argyle Studded Cardigan", price: 62000, img: "https://ecimg.cafe24img.com/pg315b86130639070/polysooem1/web/product/big/20260423/dfd11dcba8cbfc9f1772f44dcfae5e04.jpg", url: "https://polysooem.com/product/argyle-studded-cardigan-black/507/category/28/display/1/" },
  { brand: "CERRIC", name: "Bebe Top", price: 49750, img: "https://en.cerric.co/web/product/medium/202604/804b8293caf44fda2ee378cfa34c0f0c.jpg", url: "https://en.cerric.co/product/bebe-top-brown/3013/category/605/display/1/" },
  { brand: "GLOWNY", name: "Bliss Fit Romper", price: 138000, img: "https://glowny.co.kr/web/product/big/202601/367d2c089ae5c277bc9b96f170560765.jpg", url: "https://glowny.co.kr/product/detail.html?product_no=3893&cate_no=258&display_group=1" },
  { brand: "Nii Hai", name: "Deep Jumper", price: 143000, img: "https://cdn.shopify.com/s/files/1/0508/0825/8728/files/271_ef8042f0-cc04-47ac-a7c3-e99572f2fd07.png?v=1781001450", url: "https://www.niihai.com/products/deep-jumper-in-white" },
  { brand: "Thevinylhouse", name: "Double Layered Shorts", price: 149000, img: "https://www.8division.com/web/product/big/202604/90fd3cd3be592e768502415e831ac146.jpg", url: "https://www.8division.com/product/detail.html?product_no=65122&cate_no=219&display_group=1" },
  { brand: "Ulikasanctus", name: "Curtain Half Pants", price: 159000, img: "https://ulikasanctus.com/web/product/extra/big/202604/5ebc5cd25b1a8d194ffcee4267b06d43.jpg", url: "https://ulikasanctus.com/product/curtain-half-pants-beige/298/category/1/display/3/" },
  { brand: "innir", name: "Camo Sweat Layer Skirt", price: 59000, img: "https://www.8division.com/web/product/big/202606/8e27dc0e92063afb343849838477a988.jpg", url: "https://www.8division.com/product/detail.html?product_no=67103&cate_no=219&display_group=1" },
  { brand: "EGNARTS", name: "Newold Long Sleeve Tee", price: 72000, img: "https://www.8division.com/web/product/big/202502/0a23c0fbf532e1d57e6abdbde95591d4.jpg", url: "https://www.8division.com/product/detail.html?product_no=46532&cate_no=218&display_group=1" },
  { brand: "Jijivisha", name: "Waffle Hoodie", price: 115000, img: "https://www.8division.com/web/product/extra/big/202411/f076f1e49910ebb73fe27c271d25c418.jpg", url: "https://www.8division.com/product/detail.html?product_no=45501&cate_no=218&display_group=1" },
  { brand: "Loadingroom", name: "Logo Slim Tee", price: 27600, img: "https://cdn.shopify.com/s/files/1/0837/5723/6512/files/38_LOGOSLIMTEE_WHITE_2_33305c7c-b905-4652-bddd-af9b343dc77c.png?v=1773651408", url: "https://loading-room.com/products/logo-slim-tee-white" },
  { brand: "Les", name: "Fin Linen Top", price: 88000, img: "https://www.8division.com/web/product/extra/big/202606/57d06ca7f7c03fa52236b3c976723445.jpg", url: "https://www.8division.com/product/detail.html?product_no=68226&cate_no=218&display_group=1" },
  { brand: "FOUND", name: "Flare Jeans", price: 220000, img: "https://etcseoul.com/web/product/small/202603/e54a5d0de843c97042a21e615f14425b.jpg", url: "https://etcseoul.com/product/detail.html?product_no=46117&cate_no=103&display_group=1" },
  { brand: "Matteveil", name: "Gel Half Bodysuit", price: 54000, img: "https://ecimg.cafe24img.com/pg2490b18529217062/mikang12/web/product/extra/big/20260719/7a9370b61cece20e3b64f360e614626a.jpg", url: "https://matteveil.kr/product/2nd-gel-half-bodysuit/27/category/43/display/1/" },
  { brand: "ODOR", name: "Romance Flower Sleeveless", price: 48000, img: "https://cafe24img.poxo.com/haaan2i/web/product/big/202605/a3f0f6fb0d77325e7cc6310bb07e2304.jpg", url: "https://odorshop.co.kr/product/romance-flower-sleeveless-navy/4512/category/167/display/1/" },
  { brand: "SETUPEXE", name: "Flower Shirring Pants", price: 154000, img: "https://www.setup-exe.com/web/product/extra/big/202507/ab48301a0e6473d6df36d9ce77fa2543.jpg", url: "https://www.setup-exe.com/product/detail.html?product_no=1397&cate_no=133&display_group=1" },
  { brand: "HIETA", name: "777Angels Bag", price: 38400, img: "https://ecimg.cafe24img.com/pg782b71822866028/nita23/web/product/medium/20250205/8262ed5d0ece8bc98f634edb440f7782.jpg", url: "https://hieta.co.kr/product/777angels-bag-beige-leopard/59/category/62/display/1/" },
]

export const EXAMPLES = ["닝닝 공항패션st 옷 찾아줘", "170cm인데 롱 부츠컷 청바지", "스킴스 쫄티 같은 거", "하이웨이스트 니트", "하객룩 원피스"]
export const REFINES = ["조금 더 캐주얼하게", "더 저렴한 걸로", "비슷한 무드 더", "다른 색으로"]

export const krw = (n: number | null | undefined): string =>
  n == null ? "" : "₩" + Number(n).toLocaleString("ko-KR")

export function pickTurn(i: number): Product[] {
  const s = (i * 8) % PRODUCTS.length
  return Array.from({ length: 8 }, (_, k) => PRODUCTS[(s + k) % PRODUCTS.length])
}

export const byUrl = (u: string): Product | undefined => PRODUCTS.find((x) => x.url === u)

export function similar(p: Product): Product[] {
  const i = PRODUCTS.indexOf(p)
  const out: Product[] = []
  for (let k = 1; out.length < 6 && k <= PRODUCTS.length; k++) {
    const s = PRODUCTS[(i + k) % PRODUCTS.length]
    if (s !== p) out.push(s)
  }
  return out
}
