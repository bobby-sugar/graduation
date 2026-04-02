interface CommissionCardProps {
    id: string;
    title: string;
    client: string;
    clientAvatar?: string;
    price: number;
    status: 'new' | 'pending' | 'payment-pending' | 'wip' | 'review-pending' | 'revising' | 'done';
    paymentStatus: 'unpaid' | 'paid' | 'partial' | 'hold';
    paymentAmount?: number; // 部分付款的百分比
    submittedDate: string;
    category?: string;
    previewImage?: string;
    isMine?: boolean;
    onClick?: () => void;
}

export default function CommissionCard({
    title,
    client,
    clientAvatar,
    price,
    submittedDate,
    category,
    previewImage,
    isMine,
    onClick,
}: CommissionCardProps) {
    const formatPublishDate = (dateString: string) => {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return "-";
        const now = new Date();
        const isToday =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();
        return isToday
            ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
            : date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    };

    return (
        <div className="commission-card" onClick={onClick}>
            <div className="commission-card-header">
                {previewImage && (
                    <div className="commission-card-preview">
                        <img src={previewImage} alt={title} />
                    </div>
                )}
            </div>

            <div className="commission-card-body">
                <h3 className="commission-card-title">{title}</h3>
                
                <div className="commission-card-client">
                    {clientAvatar && (
                        <img 
                            src={clientAvatar} 
                            alt={client} 
                            className="commission-card-avatar"
                        />
                    )}
                    <div className="commission-card-client-info">
                        <div className="commission-card-client-name-row">
                            <span className="commission-card-client-name">{client}</span>
                            {isMine && <span className="commission-card-self-badge">我发布的</span>}
                        </div>
                        {category && (
                            <span className="commission-card-category">{category}</span>
                        )}
                    </div>
                </div>

                <div className="commission-card-details">
                    <div className="commission-card-detail-item">
                        <span className="commission-card-detail-label">价格:</span>
                        <span className="commission-card-detail-value">¥{price.toLocaleString()}</span>
                    </div>
                    <div className="commission-card-detail-item">
                        <span className="commission-card-detail-label">发布时间:</span>
                        <span className="commission-card-detail-value">{formatPublishDate(submittedDate)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
