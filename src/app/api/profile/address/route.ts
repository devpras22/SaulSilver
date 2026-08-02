import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export interface AddressEntry {
  id: string;
  label: string;
  address: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    const body = await req.json();
    const action = body.action || "add";
    
    let addresses: AddressEntry[] = user.user_metadata?.addresses || [];
    let active_address_id: string | null = user.user_metadata?.active_address_id || null;

    if (action === "add") {
      const { address, label } = body;
      if (!address?.trim() || !label?.trim()) return NextResponse.json({ error: "address and label required" }, { status: 400 });
      const newEntry: AddressEntry = {
        id: Math.random().toString(36).substring(2, 9),
        label: label.trim(),
        address: address.trim(),
      };
      addresses = [...addresses, newEntry];
      active_address_id = newEntry.id;
    } else if (action === "set_active") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (addresses.some(a => a.id === id)) {
        active_address_id = id;
      }
    } else if (action === "edit") {
      const { id, address, label } = body;
      if (!id || !address?.trim() || !label?.trim()) return NextResponse.json({ error: "id, address, and label required" }, { status: 400 });
      addresses = addresses.map(a => a.id === id ? { ...a, label: label.trim(), address: address.trim() } : a);
    } else if (action === "delete") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      addresses = addresses.filter(a => a.id !== id);
      if (active_address_id === id) {
        active_address_id = addresses.length > 0 ? addresses[0].id : null;
      }
    }

    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, addresses, active_address_id },
    });

    if (error) throw error;
    return NextResponse.json({ success: true, addresses, active_address_id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
