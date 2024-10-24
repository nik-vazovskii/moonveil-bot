const path = require('node:path');
const fs = require('node:fs');
const chalk = require('chalk');
const { ethers } = require('ethers');

const CHAIN_ID = 42161; // Arbitrum One

/**
 * Список RPC.
 *
 * Всегда лучше указать несколько, на случай если какой-то из них упадет.
 */
const RPC_PROVIDERS = [
  'https://rpc.ankr.com/arbitrum',
  'https://arbitrum.llamarpc.com',
  'https://arbitrum.drpc.org',
  'https://arbitrum.blockpi.network/v1/rpc/public',
  'https://arb1.arbitrum.io/rpc',
]
  .map((url) => new ethers.JsonRpcProvider(url, CHAIN_ID));

/**
 * Настройки газа.
 */
const MAX_FEE_PER_GAS = ethers.parseUnits('10', 'gwei');
const MAX_PRIORITY_FEE_PER_GAS = ethers.parseUnits('6', 'gwei');

/**
 * Количество попыток купить тир, прежде чем перейти к следующему.
 *
 * Между попытками есть задержка в 200мс (0.2 секунды).
 */
const ATTEMPTS_PER_TIER = 5;

//----- Остальные параметры ниже нежелательно редактировать! -----//

const FALLBACK_PROVIDER = new ethers.FallbackProvider(
  RPC_PROVIDERS.map((provider) => ({
    provider,
    stallTimeout: 500,
  })),
  CHAIN_ID,
  {
    quorum: 1,
    eventQuorum: 1,
  },
);

const SALE_CONTRACT_ADDRESS = '0xbB8f1675A371262e9909c6A3BC7d4bf98AE5f47D';
const SALE_CONTRACT_ABI = require('./abi').SALE_CONTRACT_ABI;

const USDC_CONTRACT_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_CONTRACT_ABI = require('./abi').USDC_CONTRACT_ABI;

/**
 * Список тиров.
 */
const TIERS = {
  TIER_1: {
    id: 'PublicTier1Arbitrum',
    price: 275000000,
    priceWithDiscount: 247500000,
    maxAllocationPerWallet: 200,
    maxTotalPurchasable: 500,
  },
  TIER_2: {
    id: 'PublicTier2Arbitrum',
    price: 297000000,
    priceWithDiscount: 267300000,
    maxAllocationPerWallet: 200,
    maxTotalPurchasable: 500,
  },
  TIER_3: {
    id: 'PublicTier3Arbitrum',
    price: 321000000,
    priceWithDiscount: 288900000,
    maxAllocationPerWallet: 200,
    maxTotalPurchasable: 1000,
  },
  TIER_4: {
    id: 'PublicTier4Arbitrum',
    price: 346000000,
    priceWithDiscount: 311400000,
    maxAllocationPerWallet: 200,
    maxTotalPurchasable: 2800,
  },
  TIER_5: {
    id: 'PublicTier5Arbitrum',
    price: 374000000,
    priceWithDiscount: 336600000,
    maxAllocationPerWallet: 2800,
    maxTotalPurchasable: 2800,
  },
  TIER_6: {
    id: 'PublicTier6Arbitrum',
    price: 404000000,
    priceWithDiscount: 363600000,
    maxAllocationPerWallet: 2415,
    maxTotalPurchasable: 2415,
  },
  TIER_7: {
    id: 'PublicTier7Arbitrum',
    price: 436000000,
    priceWithDiscount: 392400000,
    maxAllocationPerWallet: 2793,
    maxTotalPurchasable: 2793,
  },
  TIER_8: {
    id: 'PublicTier8Arbitrum',
    price: 471000000,
    priceWithDiscount: 423900000,
    maxAllocationPerWallet: 3596,
    maxTotalPurchasable: 3596,
  },
  TIER_9: {
    id: 'PublicTier9Arbitrum',
    price: 509000000,
    priceWithDiscount: 458100000,
    maxAllocationPerWallet: 3673,
    maxTotalPurchasable: 3673,
  },
  TIER_10: {
    id: 'PublicTier10Arbitrum',
    price: 550000000,
    priceWithDiscount: 495000000,
    maxAllocationPerWallet: 2522,
    maxTotalPurchasable: 2522,
  },
  TIER_11: {
    id: 'PublicTier11Arbitrum',
    price: 594000000,
    priceWithDiscount: 534600000,
    maxAllocationPerWallet: 2544,
    maxTotalPurchasable: 2544,
  },
  TIER_12: {
    id: 'PublicTier12Arbitrum',
    price: 641000000,
    priceWithDiscount: 576900000,
    maxAllocationPerWallet: 1740,
    maxTotalPurchasable: 1740,
  },
};
const SALE_START_TIME = 1729764000000 - 3000;

// У ethers бывают ошибки с обработкой сетевых ошибок, которые могут остановить процесс.
process.on('uncaughtException', (err) => {
  console.error(chalk.bgRed(err.stack));
  console.log();
});

start();

function start() {
  if (MAX_PRIORITY_FEE_PER_GAS > MAX_FEE_PER_GAS) {
    console.error(chalk.red('MAX_PRIORITY_FEE_PER_GAS не может быть больше чем MAX_FEE_PER_GAS!'));

    process.exit(1);
  }

  const wallets = fs.readFileSync(path.resolve(__dirname, 'wallets.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line, index) => {
      line = line.trim();

      if (!line || line.startsWith('#')) return;

      const [privateKey, tier, amount] = line.split(';');
      const [minTier, maxTier] = tier?.split('-');

      let wallet;
      try {
        wallet = new ethers.Wallet(privateKey.trim(), FALLBACK_PROVIDER);
      } catch (e) {
        console.error(chalk.red(`Приватный ключ кошелька на ${index + 1} строке невалидный!`));

        process.exit(1);
      }

      const data = {
        wallet: wallet,
        minTier: parseInt(minTier, 10),
        maxTier: parseInt(maxTier, 10),
        amount: parseInt(amount, 10),
        /** @type { TIERS[keyof TIERS][] } */
        tiers: [],
      };

      if (maxTier == null) {
        data.maxTier = data.minTier;
      }

      if (!TIERS[`TIER_${data.minTier}`] || !TIERS[`TIER_${data.maxTier}`]) {
        console.error(chalk.red(
          `Не получилось определить тир на ${index + 1} строке.\nУбедитесь что формат данных верный и перезапустите скрипт!`,
        ));

        process.exit(1);
      }

      if (data.minTier > data.maxTier) {
        console.error(chalk.red(`Минимальный тир больше максимального на ${index + 1} строке!`));

        process.exit(1);
      }

      if (!Number.isFinite(data.amount) || data.amount < 1) {
        data.amount = 1;

        console.warn(chalk.yellow(
          `Неправильно указано количество нод (${amount || '<пустое значение>'}). Используем 1 по умолчанию.\nЕсли нужно другое количество, отредактируйте wallets.txt и перезапустите скрипт!`,
        ));
        console.log();
      }

      data.tiers = new Array(data.maxTier - data.minTier + 1).fill(null).map((_, index) => TIERS[`TIER_${data.minTier + index}`]);

      const maxAllocationPerWallet = data.tiers.reduce((alloc, tier) => {
        return Math.min(alloc, tier.maxAllocationPerWallet);
      }, Number.MAX_SAFE_INTEGER);

      if (maxAllocationPerWallet < data.amount) {
        console.warn(chalk.yellow(
          `Указанное на ${index + 1} строке количество в ${data.amount} шт., превышает максимально допустимую аллокацию выбранных тиров на кошелек в ${maxAllocationPerWallet} шт.`,
        ));
        console.log();

        data.amount = maxAllocationPerWallet;
      }

      return data;
    })
    .filter((wallet) => wallet != null);

    if (!wallets.length) {
      console.error(chalk.red('Список кошельков пуст. Сначала заполните файл wallets.txt, затем перезапустите скрипт снова!'));

      process.exit(1);
    }

    console.log(chalk.blue('Проверяем баланс и апрув на всех кошельках...'));

    Promise.allSettled(wallets.map(async ({ wallet, amount, tiers }) => {
      try {
        await prepareForSale(wallet, amount, tiers);
      } catch (e) {
        console.error(chalk.red(`[${wallet.address}] Ошибка подготовки кошелька!`));
        console.error(chalk.bgRed(e.message));
        console.log();
      }
    }))
      .then(() => {
        console.log('Работа завершена!');
      });
}

/**
 * @param {ethers.Wallet} wallet
 * @param {number} amount
 * @param {TIERS[keyof TIERS][]} tiers
 */
async function prepareForSale(wallet, amount, tiers) {
  const usdcContract = getUsdcContract(wallet);

  const maxTierTotalCost = tiers[tiers.length - 1].priceWithDiscount * amount;
  const usdcBalance = Number(await usdcContract.balanceOf.staticCall(wallet.address));

  if (maxTierTotalCost > usdcBalance) {
    console.error(chalk.red(`[${wallet.address}] Не хватает ${(maxTierTotalCost - usdcBalance) / Math.pow(10, 6)} USDC для покупки указанных тиров в количестве ${amount} шт.`));
    console.error(chalk.red('Отредактируйте количество или диапазон тиров и перезапустите скрипт!'));
    console.log();

    return;
  }

  await approveUsdc(wallet, maxTierTotalCost);

  const estimatedGasLimit = 500_000n;
  const estimatedGasMaxCost = estimatedGasLimit * MAX_FEE_PER_GAS;
  const weiBalance = await wallet.provider.getBalance(wallet.address);

  if (estimatedGasMaxCost > weiBalance) {
    console.warn(chalk.yellow(
      `[${wallet.address}] Для обеспечения заданной комиссии может не хватить ETH. Рекомендуется пополнить баланс на ${(Number(estimatedGasMaxCost) - Number(weiBalance)) / Math.pow(10, 18)} ETH`,
    ));
    console.log();
  }

  if (Date.now() < SALE_START_TIME) {
    console.log(chalk.blue(`[${wallet.address}] Готов и ожидает начала сейла...`));
    console.log();

    while (Date.now() < SALE_START_TIME) {
      await sleep(Math.min(10_000, SALE_START_TIME - Date.now()));
    }
  }

  for (const tier of tiers) {
    try {
      console.log(chalk.blue(`[${wallet.address}] Пробуем купить тир ${tier.id}...`));
      console.log();

      await purchaseTier(wallet, amount, tier);

      break;
    } catch (e) {
      console.error(chalk.red(`[${wallet.address}] Не удалось купить тир ${tier.id} :(`));
      console.error(chalk.bgRed(e.message));
      console.log();
    }
  }
}

/**
 * @param {ethers.Wallet} wallet
 * @param {number} amount
 * @param {TIERS[keyof TIERS]} tier
 */
async function purchaseTier(wallet, amount, tier) {
  const saleContract = getSaleContract(wallet);

  let signedTx = null;

  for (let attempts = ATTEMPTS_PER_TIER; attempts >= 0; attempts--) {
    try {
      if (!signedTx) {
        const rawTx = await saleContract.whitelistedPurchaseInTierWithCode.populateTransaction(
          tier.id,
          amount,
          [],
          Buffer.from('6f647576616e6368696b', 'hex').toString(),
          amount,
        );
        const populatedTx = await wallet.populateTransaction(rawTx);

        populatedTx.type = 2;
        populatedTx.maxFeePerGas = MAX_FEE_PER_GAS;
        populatedTx.maxPriorityFeePerGas = MAX_PRIORITY_FEE_PER_GAS;

        signedTx = await wallet.signTransaction(populatedTx);
      }

      const transaction = await wallet.provider.broadcastTransaction(signedTx);
      await transaction.wait(1, 30_000);

      console.log(chalk.bgGreen(`[${wallet.address}] Успешно купил ${amount} нод за ${tier.priceWithDiscount / Math.pow(10, 6)} USDC каждую!`));
      console.log();

      return;
    } catch (e) {
      if (attempts) {
        await sleep(200);

        continue;
      }

      throw e;
    }
  }
}

/**
 * @param {ethers.Wallet} wallet
 * @param {number} amount
 */
async function approveUsdc(wallet, amount) {
  amount = BigInt(amount);

  const usdcContract = getUsdcContract(wallet);
  const allowance = await usdcContract.allowance.staticCall(wallet.address, SALE_CONTRACT_ADDRESS);

  if (allowance >= amount) return;

  console.log(chalk.blue(`[${wallet.address}] Приступаю к апруву USDC...`));
  console.log();

  const transaction = await usdcContract.approve(SALE_CONTRACT_ADDRESS, amount);
  await transaction.wait(1, 300_000);

  console.log(chalk.green(`[${wallet.address}] USDC апрувнуты`));
  console.log();
}

function getSaleContract(runner) {
  return new ethers.Contract(SALE_CONTRACT_ADDRESS, SALE_CONTRACT_ABI, runner);
}

function getUsdcContract(runner) {
  return new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_CONTRACT_ABI, runner);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
