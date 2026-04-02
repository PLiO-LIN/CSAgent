import PackageCard from './PackageCard'
import BalanceCard from './BalanceCard'
import BillCard from './BillCard'
import UserInfoCard from './UserInfoCard'
import PointsCard from './PointsCard'
import RecommendProductCard from './RecommendProductCard'
import ProductCompareCard from './ProductCompareCard'
import OrderListCard from './OrderListCard'
import OrderPreviewCard from './OrderPreviewCard'
import OrderVerifyCard from './OrderVerifyCard'
import PaymentCard from './PaymentCard'
import PaymentResultCard from './PaymentResultCard'
import RechargeCard from './RechargeCard'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  card: any
  onAction?: ChatSendHandler
}

export default function CardRenderer({ card, onAction }: Props) {
  switch (card.type) {
    case 'package':
      return <PackageCard data={card} />
    case 'balance':
      return <BalanceCard data={card} />
    case 'bill':
      return <BillCard data={card} />
    case 'user_info':
      return <UserInfoCard data={card} />
    case 'points':
      return <PointsCard data={card} />
    case 'recommend_plan':
      return <RecommendProductCard data={card} variant="plan" onAction={onAction} />
    case 'recommend_flow_pack':
      return <RecommendProductCard data={card} variant="flow_pack" onAction={onAction} />
    case 'recommend_benefit':
      return <RecommendProductCard data={card} variant="benefit" onAction={onAction} />
    case 'product_compare':
      return <ProductCompareCard data={card} onAction={onAction} />
    case 'order_list':
      return <OrderListCard data={card} onAction={onAction} />
    case 'order_preview':
      return <OrderPreviewCard data={card} onAction={onAction} />
    case 'order_verify':
      return <OrderVerifyCard data={card} onAction={onAction} />
    case 'payment':
      return <PaymentCard data={card} onAction={onAction} />
    case 'payment_result':
      return <PaymentResultCard data={card} onAction={onAction} />
    case 'recharge':
      return <RechargeCard data={card} onAction={onAction} />
    default:
      return (
        <div className="my-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-400 border border-gray-100">
          未知卡片类型: {card.type}
        </div>
      )
  }
}
