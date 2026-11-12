import type { IconType } from 'react-icons';
import {
  LuArrowLeftRight, LuBaby, LuBanknote, LuBike, LuBookOpen, LuBuilding2, LuBus, LuCar, LuClapperboard, LuCoffee, LuCreditCard, LuDumbbell, LuEllipsis,
  LuFuel, LuGift, LuGraduationCap, LuHandCoins, LuHeartPulse, LuHouse, LuKeyRound, LuLandmark, LuMusic, LuPartyPopper, LuPawPrint, LuPercent, LuPiggyBank,
  LuPill, LuPlane, LuRepeat, LuShieldCheck, LuShirt, LuShoppingBag, LuShoppingCart, LuSmartphone, LuSparkles, LuSprayCan, LuTrainFront, LuTrendingUp, LuTv,
  LuUtensils, LuWallet, LuWifi, LuWrench, LuZap,
} from 'react-icons/lu';
import { cn } from '@/lib/cn';

export const ICONS: Record<string, IconType> = {
  home: LuHouse, key: LuKeyRound, building: LuBuilding2, landmark: LuLandmark, zap: LuZap, car: LuCar, shield: LuShieldCheck, fuel: LuFuel,
  cart: LuShoppingCart, bike: LuBike, spray: LuSprayCan, repeat: LuRepeat, utensils: LuUtensils, bag: LuShoppingBag, bus: LuBus, heart: LuHeartPulse,
  film: LuClapperboard, plane: LuPlane, sparkles: LuSparkles, gift: LuGift, percent: LuPercent, dots: LuEllipsis, piggy: LuPiggyBank, banknote: LuBanknote,
  swap: LuArrowLeftRight, wallet: LuWallet, card: LuCreditCard, grad: LuGraduationCap, baby: LuBaby, paw: LuPawPrint, gym: LuDumbbell, phone: LuSmartphone,
  wifi: LuWifi, coffee: LuCoffee, book: LuBookOpen, trending: LuTrendingUp, coins: LuHandCoins, shirt: LuShirt, wrench: LuWrench, music: LuMusic, tv: LuTv,
  pill: LuPill, train: LuTrainFront, party: LuPartyPopper,
};

/** Icons offered when creating a category or bill. */
export const PICKABLE = ['home', 'key', 'building', 'zap', 'wifi', 'phone', 'car', 'fuel', 'bus', 'train', 'cart', 'utensils', 'coffee', 'bike', 'bag', 'shirt', 'spray', 'wrench', 'repeat', 'tv', 'music', 'film', 'party', 'plane', 'heart', 'pill', 'gym', 'sparkles', 'paw', 'baby', 'grad', 'book', 'gift', 'card', 'coins', 'percent', 'shield', 'landmark', 'piggy', 'dots'];

const SIZES = { sm: 'size-8 rounded-[10px] text-[15px]', md: 'size-10 rounded-xl text-lg', lg: 'size-12 rounded-2xl text-xl' };

/** A category icon on a tint of its own colour. */
export function IconTile({ icon, color, size = 'md', className }: { icon: string; color: string; size?: keyof typeof SIZES; className?: string }) {
  const Icon = ICONS[icon] ?? LuEllipsis;
  return (
    <span className={cn('grid shrink-0 place-items-center', SIZES[size], className)} style={{ backgroundColor: `${color}1f`, color }} aria-hidden>
      <Icon />
    </span>
  );
}
