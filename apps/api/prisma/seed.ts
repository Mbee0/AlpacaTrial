import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultSymbols = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "TSLA",
  "AMD",
  "JPM",
  "SPY"
];

async function main() {
  for (const symbol of defaultSymbols) {
    await prisma.asset.upsert({
      where: { symbol },
      update: {},
      create: {
        symbol,
        isShortable: true,
        isActive: true
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
