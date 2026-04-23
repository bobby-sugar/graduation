interface FilterOption {
    label: string;
    icon: React.ReactNode;
}

const filterOptions: FilterOption[] = [
    {
        label: 'OC',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        )
    },
    {
        label: '世界观',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
        )
    },
    {
        label: '表情包',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
            </svg>
        )
    },
];

interface StudioFilterSidebarProps {
    selectedCategory: string | null;
    onCategorySelect: (category: string) => void;
}

export default function StudioFilterSidebar({ selectedCategory, onCategorySelect }: StudioFilterSidebarProps) {
    return (
        <div className="studio-filter-sidebar">
            <div className="studio-filter-sidebar-content">
                {filterOptions.map((option) => (
                    <button
                        key={option.label}
                        className={`studio-filter-option ${selectedCategory === option.label ? 'active' : ''}`}
                        onClick={() => onCategorySelect(option.label)}
                    >
                        <span className="studio-filter-option-icon">{option.icon}</span>
                        <span className="studio-filter-option-label">{option.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
