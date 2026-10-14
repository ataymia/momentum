export const MARKETING_CATEGORIES=["Momentum Marketing","Frutex Marketing","Social Media","Printables","Approved Downloads"] as const;
export const COLLATERAL_TYPES=["Window stickers","Cooler stickers","Flyers","Posters","Coasters","Pizza flyers","Bifold folders","Pitch decks","Other approved collateral"] as const;
export const PRODUCTION_STAGES=["Requested","Assigned","Draft","Approval","Printing","Ready","Completed"] as const;
export type MarketingCategory=typeof MARKETING_CATEGORIES[number];
export type MarketingVersion={id:string;assetId:string;name:string;category:MarketingCategory;status:"Draft"|"Approved"|"Archived";storagePath:string;fileName:string;createdAt:string;createdBy:string;version:number;updatedAt:string;updatedBy:string;deleted:boolean};
export type ProductionRequest={id:string;requesterId:string;requesterName:string;title:string;useCase:string;quantity:number;dueDate:string;ownerId:string;status:typeof PRODUCTION_STAGES[number];draftVersionId:string;approvedVersionId:string;createdAt:string;updatedAt:string;updatedBy:string;history:{at:string;actorId:string;status:string}[]};
export const canManageMarketingLibrary=(role:string)=>role==="Administrator"||role==="Marketing";
