import { useState, useEffect } from "react";

interface CreateFormProps {
    category: string;
    isVisible: boolean;
    onClose: () => void;
    onSubmit: (data: any) => void;
    onNext?: (data: any) => void;
}

// 使用一个计数器来确保每次显示时都重新触发动画
let animationKey = 0;

const getFormFields = (category: string) => {
    switch (category) {
        case 'OC':
            return [
                { name: 'name', label: '姓名', type: 'text', required: true },
                { name: 'gender', label: '性别', type: 'text', required: false },
                { name: 'age', label: '年龄', type: 'number', required: false },
                { name: 'race', label: '种族', type: 'text', required: false },
                { name: 'occupation', label: '职业', type: 'text', required: false },
                { name: 'personality', label: '性格特点', type: 'textarea', required: false },
                { name: 'description', label: '简介', type: 'textarea', required: false },
                { name: 'tags', label: '标签', type: 'text', required: false },
            ];
        case '世界观':
            return [
                { name: 'name', label: '世界观名称', type: 'text', required: true },
                { name: 'description', label: '世界观描述', type: 'textarea', required: true },
                { name: 'type', label: '类型', type: 'select', options: ['奇幻', '科幻', '现代', '古代', '其他'], required: false },
            ];
        case '捏捏':
            return [
                { name: 'name', label: '名称', type: 'text', required: true },
                { name: 'description', label: '描述', type: 'textarea', required: false },
            ];
        case '表情包':
            return [
                { name: 'name', label: '表情包名称', type: 'text', required: true },
                { name: 'description', label: '描述', type: 'textarea', required: false },
                { name: 'tags', label: '标签', type: 'text', required: false },
            ];
        case '小说':
            return [
                { name: 'title', label: '小说标题', type: 'text', required: true },
                { name: 'description', label: '简介', type: 'textarea', required: true },
                { name: 'genre', label: '类型', type: 'select', options: ['言情', '玄幻', '科幻', '悬疑', '其他'], required: false },
            ];
        case '漫画':
            return [
                { name: 'title', label: '漫画标题', type: 'text', required: true },
                { name: 'description', label: '简介', type: 'textarea', required: true },
                { name: 'genre', label: '类型', type: 'select', options: ['动作', '恋爱', '科幻', '悬疑', '其他'], required: false },
            ];
        default:
            return [];
    }
};

interface CustomTag {
    id: string;
    name: string;
    content: string;
}

interface OCRelation {
    id: string;
    name: string;
    relation: string;
}

export default function CreateForm({ category, isVisible, onClose, onSubmit, onNext }: CreateFormProps) {
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [animKey, setAnimKey] = useState(0);
    const [customTags, setCustomTags] = useState<CustomTag[]>([]);
    const [newTagName, setNewTagName] = useState('');
    const [newTagContent, setNewTagContent] = useState('');
    const [showTagInput, setShowTagInput] = useState(false);
    
    // 折叠/展开状态
    const [isBasicInfoExpanded, setIsBasicInfoExpanded] = useState(false);
    const [isOCRelationExpanded, setIsOCRelationExpanded] = useState(false);
    const [isModuleSelectorExpanded, setIsModuleSelectorExpanded] = useState(false);
    
    // OC关系
    const [ocRelations, setOcRelations] = useState<OCRelation[]>([]);
    const [showRelationInput, setShowRelationInput] = useState(false);
    const [newRelationName, setNewRelationName] = useState('');
    const [newRelationType, setNewRelationType] = useState('');
    
    // 已添加的模块
    const [addedModules, setAddedModules] = useState<string[]>([]);
    
    const fields = getFormFields(category);
    
    const availableModules = ['世界观', '外貌信息', '属性面板', '天赋技能', '兴趣爱好', '语录'];

    useEffect(() => {
        if (isVisible) {
            // 重置表单数据
            setFormData({});
            setCustomTags([]);
            setNewTagName('');
            setNewTagContent('');
            setShowTagInput(false);
            setIsBasicInfoExpanded(false);
            setIsOCRelationExpanded(false);
            setIsModuleSelectorExpanded(false);
            setOcRelations([]);
            setShowRelationInput(false);
            setNewRelationName('');
            setNewRelationType('');
            setAddedModules([]);
            // 每次显示时更新动画 key，确保重新触发动画
            animationKey++;
            setAnimKey(animationKey);
        }
    }, [isVisible, category]);

    const handleChange = (name: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddTag = () => {
        if (newTagName.trim()) {
            const newTag: CustomTag = {
                id: Date.now().toString(),
                name: newTagName.trim(),
                content: newTagContent.trim()
            };
            setCustomTags(prev => [...prev, newTag]);
            setNewTagName('');
            setNewTagContent('');
            setShowTagInput(false);
        }
    };

    const handleRemoveTag = (tagId: string) => {
        setCustomTags(prev => prev.filter(t => t.id !== tagId));
    };

    const handleAddRelation = () => {
        if (newRelationName.trim() && newRelationType.trim()) {
            const newRelation: OCRelation = {
                id: Date.now().toString(),
                name: newRelationName.trim(),
                relation: newRelationType.trim()
            };
            setOcRelations(prev => [...prev, newRelation]);
            setNewRelationName('');
            setNewRelationType('');
            setShowRelationInput(false);
        }
    };

    const handleRemoveRelation = (relationId: string) => {
        setOcRelations(prev => prev.filter(r => r.id !== relationId));
    };

    const handleAddModule = (module: string) => {
        if (!addedModules.includes(module)) {
            setAddedModules(prev => [...prev, module]);
            setIsModuleSelectorExpanded(false);
        }
    };

    const handleRemoveModule = (module: string) => {
        setAddedModules(prev => prev.filter(m => m !== module));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const submitData = {
            ...formData,
            customTags: customTags,
            ocRelations: ocRelations,
            addedModules: addedModules
        };
        
        const isOC = category === 'OC';
        if (isOC && onNext) {
            // OC类别点击下一步，调用onNext
            onNext(submitData);
        } else {
            // 其他类别或没有onNext，直接提交
            onSubmit(submitData);
            onClose();
        }
    };

    if (!isVisible) return null;

    const isOC = category === 'OC';

    return (
        <div className="create-form-wrapper" key={animKey}>
            <div className="create-form-bubble">
                <div className="create-form-header">
                    <h2 className="create-form-title">创建{category}</h2>
                    <button className="create-form-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <form className="create-form-content" onSubmit={handleSubmit}>
                    {isOC ? (
                        <>
                            {/* 基本信息 - 可折叠 */}
                            <div className="create-form-collapsible-section">
                                <button
                                    type="button"
                                    className="create-form-collapsible-header"
                                    onClick={() => setIsBasicInfoExpanded(!isBasicInfoExpanded)}
                                >
                                    <span className="create-form-collapsible-title">基本信息</span>
                                    <svg
                                        className={`create-form-collapsible-arrow ${isBasicInfoExpanded ? 'expanded' : ''}`}
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                {isBasicInfoExpanded && (
                                    <div className="create-form-collapsible-content">
                                        {fields.map((field) => (
                                            <div key={field.name} className="create-form-field">
                                                <label className="create-form-label">
                                                    {field.label}
                                                    {field.required && <span className="create-form-required">*</span>}
                                                </label>
                                                {field.type === 'textarea' ? (
                                                    <textarea
                                                        className="create-form-input"
                                                        value={formData[field.name] || ''}
                                                        onChange={(e) => handleChange(field.name, e.target.value)}
                                                        rows={4}
                                                        required={field.required}
                                                        placeholder={`请输入${field.label}`}
                                                    />
                                                ) : field.type === 'select' ? (
                                                    <select
                                                        className="create-form-input"
                                                        value={formData[field.name] || ''}
                                                        onChange={(e) => handleChange(field.name, e.target.value)}
                                                        required={field.required}
                                                    >
                                                        <option value="">请选择</option>
                                                        {field.options?.map((option) => (
                                                            <option key={option} value={option}>{option}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        className="create-form-input"
                                                        type={field.type}
                                                        value={formData[field.name] || ''}
                                                        onChange={(e) => handleChange(field.name, e.target.value)}
                                                        required={field.required}
                                                        placeholder={field.name === 'tags' ? '多个标签用逗号分隔，仅作展示' : `请输入${field.label}`}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                        
                                        {/* 自定义标签 - 在基本信息内 */}
                                        <div className="create-form-tags-section">
                                            {customTags.length > 0 && (
                                                <div className="create-form-tags">
                                                    {customTags.map((tag) => (
                                                        <div key={tag.id} className="create-form-tag-item">
                                                            <div className="create-form-tag-header">
                                                                <span className="create-form-tag-name">{tag.name}</span>
                                                                <button
                                                                    type="button"
                                                                    className="create-form-tag-remove"
                                                                    onClick={() => handleRemoveTag(tag.id)}
                                                                >
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                            {tag.content && (
                                                                <div className="create-form-tag-content">{tag.content}</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            {showTagInput ? (
                                                <div className="create-form-tag-input-container">
                                                    <div className="create-form-tag-input-row">
                                                        <input
                                                            type="text"
                                                            className="create-form-tag-input"
                                                            value={newTagName}
                                                            onChange={(e) => setNewTagName(e.target.value)}
                                                            placeholder="标签名称"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <div className="create-form-tag-input-row">
                                                        <input
                                                            type="text"
                                                            className="create-form-tag-input"
                                                            value={newTagContent}
                                                            onChange={(e) => setNewTagContent(e.target.value)}
                                                            placeholder="标签内容"
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    handleAddTag();
                                                                } else if (e.key === 'Escape') {
                                                                    setShowTagInput(false);
                                                                    setNewTagName('');
                                                                    setNewTagContent('');
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="create-form-tag-input-actions">
                                                        <button
                                                            type="button"
                                                            className="create-form-tag-confirm"
                                                            onClick={handleAddTag}
                                                        >
                                                            确认
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="create-form-tag-cancel"
                                                            onClick={() => {
                                                                setShowTagInput(false);
                                                                setNewTagName('');
                                                                setNewTagContent('');
                                                            }}
                                                        >
                                                            取消
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="create-form-add-tag-btn"
                                                    onClick={() => setShowTagInput(true)}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                                    </svg>
                                                    添加自定义标签
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* OC关系 - 可折叠 */}
                            <div className="create-form-collapsible-section">
                                <button
                                    type="button"
                                    className="create-form-collapsible-header"
                                    onClick={() => setIsOCRelationExpanded(!isOCRelationExpanded)}
                                >
                                    <span className="create-form-collapsible-title">OC关系</span>
                                    <svg
                                        className={`create-form-collapsible-arrow ${isOCRelationExpanded ? 'expanded' : ''}`}
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                {isOCRelationExpanded && (
                                    <div className="create-form-collapsible-content">
                                        {ocRelations.length > 0 && (
                                            <div className="create-form-relations">
                                                {ocRelations.map((relation) => (
                                                    <div key={relation.id} className="create-form-relation-item">
                                                        <div className="create-form-relation-info">
                                                            <span className="create-form-relation-name">{relation.name}</span>
                                                            <span className="create-form-relation-type">{relation.relation}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="create-form-relation-remove"
                                                            onClick={() => handleRemoveRelation(relation.id)}
                                                        >
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {showRelationInput ? (
                                            <div className="create-form-relation-input-container">
                                                <div className="create-form-tag-input-row">
                                                    <input
                                                        type="text"
                                                        className="create-form-tag-input"
                                                        value={newRelationName}
                                                        onChange={(e) => setNewRelationName(e.target.value)}
                                                        placeholder="OC名称"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="create-form-tag-input-row">
                                                    <input
                                                        type="text"
                                                        className="create-form-tag-input"
                                                        value={newRelationType}
                                                        onChange={(e) => setNewRelationType(e.target.value)}
                                                        placeholder="关系类型"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleAddRelation();
                                                            } else if (e.key === 'Escape') {
                                                                setShowRelationInput(false);
                                                                setNewRelationName('');
                                                                setNewRelationType('');
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <div className="create-form-tag-input-actions">
                                                    <button
                                                        type="button"
                                                        className="create-form-tag-confirm"
                                                        onClick={handleAddRelation}
                                                    >
                                                        确认
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="create-form-tag-cancel"
                                                        onClick={() => {
                                                            setShowRelationInput(false);
                                                            setNewRelationName('');
                                                            setNewRelationType('');
                                                        }}
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                className="create-form-add-relation-btn"
                                                onClick={() => setShowRelationInput(true)}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                                </svg>
                                                添加OC关系
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 添加模块 - 可折叠 */}
                            <div className="create-form-collapsible-section">
                                <button
                                    type="button"
                                    className="create-form-collapsible-header"
                                    onClick={() => setIsModuleSelectorExpanded(!isModuleSelectorExpanded)}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                    <span className="create-form-collapsible-title">添加模块</span>
                                    <svg
                                        className={`create-form-collapsible-arrow ${isModuleSelectorExpanded ? 'expanded' : ''}`}
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                {isModuleSelectorExpanded && (
                                    <div className="create-form-collapsible-content">
                                        <div className="create-form-module-selector">
                                            {availableModules.map((module) => (
                                                <button
                                                    key={module}
                                                    type="button"
                                                    className={`create-form-module-option ${addedModules.includes(module) ? 'added' : ''}`}
                                                    onClick={() => {
                                                        if (addedModules.includes(module)) {
                                                            handleRemoveModule(module);
                                                        } else {
                                                            handleAddModule(module);
                                                        }
                                                    }}
                                                >
                                                    {module}
                                                    {addedModules.includes(module) && (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        // 非OC类别的表单保持原样
                        fields.map((field) => (
                            <div key={field.name} className="create-form-field">
                                <label className="create-form-label">
                                    {field.label}
                                    {field.required && <span className="create-form-required">*</span>}
                                </label>
                                {field.type === 'textarea' ? (
                                    <textarea
                                        className="create-form-input"
                                        value={formData[field.name] || ''}
                                        onChange={(e) => handleChange(field.name, e.target.value)}
                                        rows={4}
                                        required={field.required}
                                        placeholder={`请输入${field.label}`}
                                    />
                                ) : field.type === 'select' ? (
                                    <select
                                        className="create-form-input"
                                        value={formData[field.name] || ''}
                                        onChange={(e) => handleChange(field.name, e.target.value)}
                                        required={field.required}
                                    >
                                        <option value="">请选择</option>
                                        {field.options?.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="create-form-input"
                                        type={field.type}
                                        value={formData[field.name] || ''}
                                        onChange={(e) => handleChange(field.name, e.target.value)}
                                        required={field.required}
                                        placeholder={`请输入${field.label}`}
                                    />
                                )}
                            </div>
                        ))
                    )}
                    
                    <div className="create-form-actions">
                        <button type="button" className="create-form-cancel" onClick={onClose}>
                            取消
                        </button>
                        <button type="submit" className="create-form-submit">
                            {isOC ? '下一步' : '创建'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
