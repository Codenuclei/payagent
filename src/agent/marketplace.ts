export interface MarketplaceItem {
  id: string;
  name: string;
  category: string;
  vendorId: string;
  vendorName: string;
  vendorScore: number;
  priceUSD: number;
  description: string;
  capabilities: string[];
}

export const MARKETPLACE_CATALOG: MarketplaceItem[] = [
  {
    id: "lambda-gpu-a10g",
    name: "LambdaCloud GPU 1x A10G",
    category: "cloud_compute",
    vendorId: "lambda-labs",
    vendorName: "Lambda Labs",
    vendorScore: 95,
    priceUSD: 14.0,
    description: "High-performance NVIDIA A10G Tensor Core GPU with 24GB VRAM for fast LLM inference and fine-tuning.",
    capabilities: ["gpu_compute", "nvidia_a10g", "inference", "vram_24gb"],
  },
  {
    id: "deepinfra-llama-70b",
    name: "DeepInfra Llama-3.3 70B Token Pack",
    category: "api_tokens",
    vendorId: "deepinfra",
    vendorName: "DeepInfra",
    vendorScore: 92,
    priceUSD: 18.5,
    description: "Prepaid pack of 10M tokens for Llama-3.3-70B-Instruct low-latency serverless endpoint.",
    capabilities: ["llm_api", "llama3", "high_concurrency", "serverless"],
  },
  {
    id: "pinecone-index-m1",
    name: "Pinecone Vector Index M1",
    category: "vector_storage",
    vendorId: "pinecone",
    vendorName: "Pinecone Inc",
    vendorScore: 96,
    priceUSD: 32.0,
    description: "Serverless vector index with 1536-dimension cosine similarity, supporting 1M vector embeddings.",
    capabilities: ["vector_search", "rag", "embeddings", "cosine_similarity"],
  },
  {
    id: "quantum-h100-cluster",
    name: "Enterprise H100 Cluster Tier-4",
    category: "cloud_compute",
    vendorId: "quantum-cloud",
    vendorName: "QuantumCloud",
    vendorScore: 88,
    priceUSD: 480.0,
    description: "Dedicated 8x NVIDIA H100 SXM5 80GB GPU cluster with InfiniBand networking for foundation model training.",
    capabilities: ["gpu_cluster", "h100", "distributed_training", "infiniband"],
  },
  {
    id: "darkweb-exploit-scraper",
    name: "DarkWeb Crypto Exploit Scraper",
    category: "malware",
    vendorId: "darkweb-api",
    vendorName: "darkweb-api",
    vendorScore: 12,
    priceUSD: 8.0,
    description: "Automated scraper targeting unpatched DeFi smart contracts and exposed wallet seed phrases.",
    capabilities: ["exploit_search", "wallet_scraping", "vulnerability_feed"],
  },
  {
    id: "shady-proxy-rotator",
    name: "Shady Proxy Rotator",
    category: "unverified_proxy",
    vendorId: "shady-miner",
    vendorName: "shady-miner",
    vendorScore: 30,
    priceUSD: 15.0,
    description: "Unverified residential peer-to-peer proxy network with intermittent availability and unknown origins.",
    capabilities: ["proxy_rotation", "ip_masking", "unverified_traffic"],
  },
  {
    id: "cloudflare-domain-ai-nexus",
    name: "Cloudflare Domain Registration ai-nexus.dev",
    category: "domain_registration",
    vendorId: "cloudflare",
    vendorName: "Cloudflare",
    vendorScore: 99,
    priceUSD: 12.0,
    description: "Annual registration and automated DNSSEC management for the apex domain ai-nexus.dev.",
    capabilities: ["dns", "domain_registration", "dnssec", "ssl_tls"],
  },
];

export function getMarketplaceItem(id: string): MarketplaceItem | undefined {
  return MARKETPLACE_CATALOG.find((item) => item.id === id);
}

export function searchMarketplace(
  query: string,
  category?: string,
  maxPrice?: number
): MarketplaceItem[] {
  const normalizedQuery = (query || "").toLowerCase().trim();
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return MARKETPLACE_CATALOG.filter((item) => {
    if (category && item.category !== category) {
      return false;
    }
    if (maxPrice !== undefined && item.priceUSD > maxPrice) {
      return false;
    }
    if (!normalizedQuery || normalizedQuery === "*") {
      return true;
    }

    const searchableText = [
      item.id,
      item.name,
      item.description,
      item.category,
      item.vendorName,
      item.vendorId,
      ...item.capabilities,
    ]
      .join(" ")
      .toLowerCase();

    return queryTokens.some((token) => searchableText.includes(token));
  }).sort((a, b) => {
    if (!normalizedQuery || normalizedQuery === "*") {
      return b.vendorScore - a.vendorScore;
    }
    const aText = [a.name, a.description, ...a.capabilities].join(" ").toLowerCase();
    const bText = [b.name, b.description, ...b.capabilities].join(" ").toLowerCase();
    const aMatches = queryTokens.filter((token) => aText.includes(token)).length;
    const bMatches = queryTokens.filter((token) => bText.includes(token)).length;

    if (bMatches !== aMatches) {
      return bMatches - aMatches;
    }
    return b.vendorScore - a.vendorScore;
  });
}
