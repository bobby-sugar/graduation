export class CreateArtworkDto {
  title!: string;
  description?: string;
  category!: string;
  imageUrl?: string;
  tags?: string;
  gender?: string;
  artistId?: number;
}
