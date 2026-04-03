import { z } from "zod";

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

const roomCodePattern = new RegExp(
  `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`
);

export type RoomCode = string;

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidRoomCode(value: string): value is RoomCode {
  return roomCodePattern.test(normalizeRoomCode(value));
}

export function generateRoomCode(random: () => number = Math.random): RoomCode {
  let code = "";

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const alphabetIndex = Math.floor(random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[alphabetIndex] ?? ROOM_CODE_ALPHABET[0];
  }

  return code;
}

export function createRoomCodeGenerator(
  random: () => number = Math.random
): () => RoomCode {
  return () => generateRoomCode(random);
}

export const roomCodeSchema = z
  .string()
  .transform(normalizeRoomCode)
  .pipe(
    z
      .string()
      .regex(
        roomCodePattern,
        `Room codes must be ${ROOM_CODE_LENGTH} characters from ${ROOM_CODE_ALPHABET}.`
      )
  );
