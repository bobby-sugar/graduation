export class CreateCommentDto {
  content!: string;
  userId!: number;
  artworkId!: number;
  parentId?: number;
}

